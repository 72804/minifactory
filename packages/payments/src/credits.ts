import { prisma, Prisma } from "@minifactory/db";
import { CreditLimitError } from "./catalog";

const MAX_ATTEMPTS = 8;

function retryable(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) ||
    (error instanceof Error && /could not serialize access/i.test(error.message))
  );
}

export async function getCreditBalance(appId: string, userId: string, feature: string): Promise<number> {
  const row = await prisma.creditBalance.findUnique({
    where: { appId_userId_feature: { appId, userId, feature } },
  });
  return row?.balance ?? 0;
}

export async function grantCredits(input: {
  appId: string;
  userId: string;
  feature: string;
  amount: number;
  tx?: Prisma.TransactionClient;
}): Promise<number> {
  const client = input.tx ?? prisma;
  const row = await client.creditBalance.upsert({
    where: { appId_userId_feature: { appId: input.appId, userId: input.userId, feature: input.feature } },
    create: {
      appId: input.appId,
      userId: input.userId,
      feature: input.feature,
      balance: input.amount,
    },
    update: { balance: { increment: input.amount } },
  });
  return row.balance;
}

export async function consumeCredit(input: {
  appId: string;
  userId: string;
  feature: string;
  amount?: number;
}): Promise<{ balance: number }> {
  const amount = input.amount ?? 1;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string; balance: number }>>(Prisma.sql`
            SELECT id, balance
            FROM "CreditBalance"
            WHERE "appId" = ${input.appId}
              AND "userId" = ${input.userId}
              AND feature = ${input.feature}
            FOR UPDATE
          `);
          const existing = rows[0];
          const current = existing?.balance ?? 0;
          if (current < amount) {
            throw new CreditLimitError(current);
          }
          if (existing) {
            const updated = await tx.creditBalance.update({
              where: { id: existing.id },
              data: { balance: { decrement: amount } },
            });
            return { balance: updated.balance };
          }
          throw new CreditLimitError(0);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
      );
    } catch (error) {
      if (error instanceof CreditLimitError) {
        throw error;
      }
      if (retryable(error) && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not consume purchased credit");
}

export async function refundCredit(input: {
  appId: string;
  userId: string;
  feature: string;
  amount?: number;
}): Promise<{ balance: number }> {
  const amount = input.amount ?? 1;
  const balance = await grantCredits({ ...input, amount });
  return { balance };
}
