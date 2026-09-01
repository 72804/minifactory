import type { AppConfig } from "@minifactory/config";
import {
  consumeCredit,
  CreditLimitError,
  findProduct,
  getActivePeriodEntitlement,
  getCreditBalance,
  refundCredit,
} from "@minifactory/payments";
import { consumeUsage, getUsage, refundUsage, UsageLimitError, utcDayKey, type UsageDecision } from "./usage";

export type AccessSource = "pro" | "free" | "credit";

export type AccessDecision = UsageDecision & {
  source?: AccessSource;
  credits: number;
  proActive: boolean;
  proExpiresAt: string | null;
  proRemainingToday: number | null;
  proLimit: number | null;
  freeRemaining: number;
  freeLimit: number | null;
};

export function proFeatureName(feature: string): string {
  return `${feature}_pro`;
}

function withProFeature(config: AppConfig, feature: string, dailyLimit: number): AppConfig {
  return {
    ...config,
    limits: {
      ...config.limits,
      features: {
        ...config.limits.features,
        [proFeatureName(feature)]: {
          freePerDay: dailyLimit,
          extraAfterAd: 0,
          premiumUnlimited: false,
          unlimited: false,
        },
      },
    },
  };
}

export class PaymentRequiredError extends UsageLimitError {
  declare decision: AccessDecision;

  constructor(decision: AccessDecision) {
    super(decision);
    this.name = "PaymentRequiredError";
  }
}

export async function getAccessStatus(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  feature: string;
  now?: Date;
}): Promise<AccessDecision> {
  const now = input.now ?? new Date();
  const periodKey = utcDayKey(now);
  const entitlement = await getActivePeriodEntitlement(input.appId, input.userId, now);
  const proProduct = entitlement ? findProduct(input.config.monetization.products, entitlement.productId) : undefined;
  const dailyLimit = proProduct?.dailyLimit;
  const credits = await getCreditBalance(input.appId, input.userId, input.feature);
  const free = await getUsage({
    config: input.config,
    appId: input.appId,
    userId: input.userId,
    feature: input.feature,
    now,
  });

  const base: AccessDecision = {
    allowed: false,
    remaining: 0,
    limit: free.limit,
    reason: "payment_required",
    periodKey,
    credits,
    proActive: Boolean(entitlement && dailyLimit),
    proExpiresAt: entitlement?.expiresAt?.toISOString() ?? null,
    proRemainingToday: null,
    proLimit: dailyLimit ?? null,
    freeRemaining: free.remaining,
    freeLimit: free.limit,
  };

  if (entitlement && dailyLimit) {
    const pro = await getUsage({
      config: withProFeature(input.config, input.feature, dailyLimit),
      appId: input.appId,
      userId: input.userId,
      feature: proFeatureName(input.feature),
      now,
    });
    return {
      ...base,
      allowed: pro.allowed,
      remaining: pro.remaining,
      limit: pro.limit,
      reason: pro.allowed ? "ok" : "payment_required",
      proRemainingToday: Number.isFinite(pro.remaining) ? pro.remaining : dailyLimit,
      proLimit: dailyLimit,
    };
  }

  if (free.allowed) {
    return {
      ...base,
      allowed: true,
      remaining: free.remaining,
      limit: free.limit,
      reason: "ok",
    };
  }

  if (credits > 0) {
    return {
      ...base,
      allowed: true,
      remaining: credits,
      limit: null,
      reason: "ok",
    };
  }

  return base;
}

export async function consumeAccess(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  feature: string;
  amount?: number;
  now?: Date;
}): Promise<AccessDecision> {
  const amount = input.amount ?? 1;
  const now = input.now ?? new Date();
  const entitlement = await getActivePeriodEntitlement(input.appId, input.userId, now);
  const proProduct = entitlement ? findProduct(input.config.monetization.products, entitlement.productId) : undefined;
  const dailyLimit = proProduct?.dailyLimit;

  if (entitlement && dailyLimit) {
    try {
      const usage = await consumeUsage({
        config: withProFeature(input.config, input.feature, dailyLimit),
        appId: input.appId,
        userId: input.userId,
        feature: proFeatureName(input.feature),
        amount,
        now,
      });
      const snapshot = await getAccessStatus({ ...input, now });
      return { ...snapshot, ...usage, source: "pro", proActive: true };
    } catch (error) {
      if (error instanceof UsageLimitError) {
        throw new PaymentRequiredError(await getAccessStatus({ ...input, now }));
      }
      throw error;
    }
  }

  try {
    const usage = await consumeUsage({
      config: input.config,
      appId: input.appId,
      userId: input.userId,
      feature: input.feature,
      amount,
      now,
    });
    const snapshot = await getAccessStatus({ ...input, now });
    return { ...snapshot, ...usage, source: "free" };
  } catch (error) {
    if (!(error instanceof UsageLimitError)) {
      throw error;
    }
  }

  try {
    const result = await consumeCredit({
      appId: input.appId,
      userId: input.userId,
      feature: input.feature,
      amount,
    });
    const snapshot = await getAccessStatus({ ...input, now });
    return {
      ...snapshot,
      allowed: true,
      remaining: result.balance,
      limit: null,
      reason: "ok",
      source: "credit",
      credits: result.balance,
    };
  } catch (error) {
    if (error instanceof CreditLimitError) {
      throw new PaymentRequiredError(await getAccessStatus({ ...input, now }));
    }
    throw error;
  }
}

export async function refundAccess(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  feature: string;
  source: AccessSource;
  amount?: number;
  now?: Date;
}): Promise<AccessDecision> {
  const amount = input.amount ?? 1;
  const now = input.now ?? new Date();
  if (input.source === "pro") {
    await refundUsage({
      appId: input.appId,
      userId: input.userId,
      feature: proFeatureName(input.feature),
      amount,
      now,
    });
  } else if (input.source === "free") {
    await refundUsage({
      appId: input.appId,
      userId: input.userId,
      feature: input.feature,
      amount,
      now,
    });
  } else {
    await refundCredit({
      appId: input.appId,
      userId: input.userId,
      feature: input.feature,
      amount,
    });
  }
  return getAccessStatus({ ...input, now });
}
