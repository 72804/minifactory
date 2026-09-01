import { prisma, Prisma } from "@minifactory/db";

export async function getEntitlements(appId: string, userId: string) {
  return prisma.entitlement.findMany({
    where: { appId, userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActivePeriodEntitlement(appId: string, userId: string, now = new Date()) {
  return prisma.entitlement.findFirst({
    where: {
      appId,
      userId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { expiresAt: "desc" },
  });
}

export async function grantPeriodEntitlement(input: {
  appId: string;
  userId: string;
  productId: string;
  periodDays: number;
  startsAt?: Date;
  tx?: Prisma.TransactionClient;
}) {
  const client = input.tx ?? prisma;
  const startsAt = input.startsAt ?? new Date();
  const expiresAt = new Date(startsAt.getTime() + input.periodDays * 24 * 60 * 60 * 1000);
  return client.entitlement.create({
    data: {
      appId: input.appId,
      userId: input.userId,
      productId: input.productId,
      status: "active",
      startsAt,
      expiresAt,
    },
  });
}
