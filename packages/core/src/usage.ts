import type { AppConfig } from "@minifactory/config";
import { prisma, Prisma } from "@minifactory/db";
import { hasPaidProduct } from "@minifactory/payments";

/** Usage windows are UTC calendar days (YYYY-MM-DD), never the browser timezone. */
export const USAGE_PERIOD_STRATEGY = "utc-calendar-day" as const;

export type UsageDecision = {
  allowed: boolean;
  remaining: number;
  limit: number | null;
  reason?: "unlimited" | "premium" | "quota_exceeded" | "unconfigured" | "ok" | "payment_required";
  periodKey?: string;
};

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** First configured usage feature, used by session remaining/limit. */
export function primaryUsageFeature(config: AppConfig): string {
  const keys = Object.keys(config.limits.features);
  return keys[0] ?? "process";
}

function featureDecision(
  config: AppConfig,
  featureName: string,
): { unlimited: boolean; premiumUnlimited: boolean; limit: number | null; configured: boolean } {
  const feature = config.limits.features[featureName];
  if (!feature) {
    return { unlimited: false, premiumUnlimited: false, limit: 0, configured: false };
  }
  if (feature.unlimited) {
    return { unlimited: true, premiumUnlimited: false, limit: null, configured: true };
  }
  return {
    unlimited: false,
    premiumUnlimited: feature.premiumUnlimited,
    limit: feature.freePerDay,
    configured: true,
  };
}

export async function getUsage(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  feature: string;
  now?: Date;
}): Promise<UsageDecision> {
  const spec = featureDecision(input.config, input.feature);
  const periodKey = utcDayKey(input.now);
  if (!spec.configured) {
    return { allowed: false, remaining: 0, limit: 0, reason: "unconfigured", periodKey };
  }
  if (spec.unlimited) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "unlimited", periodKey };
  }
  if (spec.premiumUnlimited) {
    const premium = await hasPaidProduct(input.appId, input.userId, "premium");
    if (premium) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "premium", periodKey };
    }
  }
  if (spec.limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "unlimited", periodKey };
  }
  const counter = await prisma.usageCounter.findUnique({
    where: {
      appId_userId_feature_periodKey: {
        appId: input.appId,
        userId: input.userId,
        feature: input.feature,
        periodKey,
      },
    },
  });
  const used = counter?.count ?? 0;
  const remaining = Math.max(0, spec.limit - used);
  return {
    allowed: remaining > 0,
    remaining,
    limit: spec.limit,
    reason: remaining > 0 ? "ok" : "quota_exceeded",
    periodKey,
  };
}

export class UsageLimitError extends Error {
  constructor(public decision: UsageDecision) {
    super("Usage limit reached");
    this.name = "UsageLimitError";
  }
}

export async function consumeUsage(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  feature: string;
  amount?: number;
  now?: Date;
}): Promise<UsageDecision> {
  const amount = input.amount ?? 1;
  const spec = featureDecision(input.config, input.feature);
  const periodKey = utcDayKey(input.now);

  if (!spec.configured) {
    throw new UsageLimitError({
      allowed: false,
      remaining: 0,
      limit: 0,
      reason: "unconfigured",
      periodKey,
    });
  }

  if (spec.unlimited) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "unlimited", periodKey };
  }

  if (spec.premiumUnlimited) {
    const premium = await hasPaidProduct(input.appId, input.userId, "premium");
    if (premium) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "premium", periodKey };
    }
  }

  if (spec.limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: null, reason: "unlimited", periodKey };
  }

  const limit = spec.limit;
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string; count: number }>>(Prisma.sql`
            SELECT id, count
            FROM "UsageCounter"
            WHERE "appId" = ${input.appId}
              AND "userId" = ${input.userId}
              AND feature = ${input.feature}
              AND "periodKey" = ${periodKey}
            FOR UPDATE
          `);
          const existing = rows[0];
          const used = existing?.count ?? 0;
          if (used + amount > limit) {
            throw new UsageLimitError({
              allowed: false,
              remaining: Math.max(0, limit - used),
              limit,
              reason: "quota_exceeded",
              periodKey,
            });
          }

          if (existing) {
            await tx.usageCounter.update({
              where: { id: existing.id },
              data: { count: { increment: amount } },
            });
          } else {
            await tx.usageCounter.create({
              data: {
                appId: input.appId,
                userId: input.userId,
                feature: input.feature,
                periodKey,
                count: amount,
              },
            });
          }

          await tx.usageEvent.create({
            data: {
              appId: input.appId,
              userId: input.userId,
              feature: input.feature,
              amount,
            },
          });

          return {
            allowed: true,
            remaining: Math.max(0, limit - used - amount),
            limit,
            reason: "ok" as const,
            periodKey,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10_000,
        },
      );
    } catch (error) {
      if (error instanceof UsageLimitError) {
        throw error;
      }
      const retryable =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")) ||
        (error instanceof Error && /could not serialize access/i.test(error.message));
      if (retryable && attempt < maxAttempts - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not consume usage");
}

export async function refundUsage(input: {
  appId: string;
  userId: string;
  feature: string;
  amount?: number;
  now?: Date;
}): Promise<UsageDecision> {
  const amount = input.amount ?? 1;
  const periodKey = utcDayKey(input.now);
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string; count: number }>>(Prisma.sql`
            SELECT id, count
            FROM "UsageCounter"
            WHERE "appId" = ${input.appId}
              AND "userId" = ${input.userId}
              AND feature = ${input.feature}
              AND "periodKey" = ${periodKey}
            FOR UPDATE
          `);
          const existing = rows[0];
          const used = existing?.count ?? 0;
          const next = Math.max(0, used - amount);
          if (existing) {
            await tx.usageCounter.update({
              where: { id: existing.id },
              data: { count: next },
            });
          }
          await tx.usageEvent.create({
            data: {
              appId: input.appId,
              userId: input.userId,
              feature: input.feature,
              amount: -amount,
            },
          });
          return {
            allowed: true,
            remaining: next === 0 && !existing ? Number.POSITIVE_INFINITY : next,
            limit: null,
            reason: "ok" as const,
            periodKey,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10_000,
        },
      );
    } catch (error) {
      const retryable =
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")) ||
        (error instanceof Error && /could not serialize access/i.test(error.message));
      if (retryable && attempt < maxAttempts - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not refund usage");
}
