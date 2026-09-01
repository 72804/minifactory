import type { AppConfig } from "@minifactory/config";
import { prisma } from "@minifactory/db";
import { parseReferralStartParam } from "@minifactory/telegram";
import type { NormalizedTelegramUser } from "@minifactory/telegram";

export async function upsertTelegramUser(user: NormalizedTelegramUser) {
  return prisma.user.upsert({
    where: { telegramId: user.telegramId },
    update: {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      languageCode: user.languageCode,
    },
    create: {
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      languageCode: user.languageCode,
    },
  });
}

export async function touchAppUser(input: {
  appId: string;
  userId: string;
  startParam?: string;
}) {
  const existing = await prisma.appUser.findUnique({
    where: { appId_userId: { appId: input.appId, userId: input.userId } },
  });
  const referralSource = existing?.referralSource ?? parseReferralStartParam(input.startParam);
  if (existing) {
    return prisma.appUser.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        openCount: { increment: 1 },
        referralSource: referralSource ?? undefined,
      },
    });
  }
  return prisma.appUser.create({
    data: {
      appId: input.appId,
      userId: input.userId,
      referralSource,
      openCount: 1,
    },
  });
}

export async function attributeReferral(input: {
  config: AppConfig;
  appId: string;
  refereeId: string;
  startParam?: string;
}): Promise<boolean> {
  if (!input.config.capabilities.includes("referrals")) {
    return false;
  }
  const code = parseReferralStartParam(input.startParam);
  if (!code) {
    return false;
  }
  const referrer = await prisma.user.findFirst({
    where: { OR: [{ id: code }, { telegramId: code }] },
    select: { id: true },
  });
  if (!referrer || referrer.id === input.refereeId) {
    return false;
  }
  try {
    await prisma.referral.create({
      data: {
        appId: input.appId,
        referrerId: referrer.id,
        refereeId: input.refereeId,
        code,
      },
    });
    return true;
  } catch {
    return false;
  }
}
