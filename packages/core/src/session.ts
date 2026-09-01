import type { AppConfig } from "@minifactory/config";
import { prisma } from "@minifactory/db";
import { track } from "@minifactory/analytics/server";
import { authenticateTelegramRequest } from "@minifactory/telegram/server";
import { ensureAppRecord } from "./app-record";
import { attributeReferral, touchAppUser, upsertTelegramUser } from "./identity";
import { getUsage, primaryUsageFeature, type UsageDecision } from "./usage";

export type MiniSession = {
  app: { id: string; slug: string; name: string };
  user: {
    id: string;
    telegramId: string;
    firstName?: string | null;
    languageCode?: string | null;
  };
  appUser: { id: string; openCount: number; firstSeen: boolean };
  usage: UsageDecision;
  mock: boolean;
};

async function loadIdentity(request: Request, config: AppConfig, feature: string) {
  const auth = authenticateTelegramRequest(request);
  const app = await ensureAppRecord(config);
  const user = await upsertTelegramUser(auth.user);
  const existing = await prisma.appUser.findUnique({
    where: { appId_userId: { appId: app.id, userId: user.id } },
  });
  const firstSeen = !existing;
  const appUser = await touchAppUser({
    appId: app.id,
    userId: user.id,
    startParam: auth.startParam,
  });
  const usage = await getUsage({ config, appId: app.id, userId: user.id, feature });
  console.info("[minifactory] identity", {
    app: config.slug,
    mock: auth.mock,
    firstSeen,
    resolved: true,
  });
  return { auth, app, user, appUser, firstSeen, usage };
}

export async function requireIdentity(
  request: Request,
  config: AppConfig,
  feature = primaryUsageFeature(config),
): Promise<MiniSession> {
  const loaded = await loadIdentity(request, config, feature);
  return {
    app: { id: loaded.app.id, slug: loaded.app.slug, name: loaded.app.name },
    user: {
      id: loaded.user.id,
      telegramId: loaded.user.telegramId,
      firstName: loaded.user.firstName,
      languageCode: loaded.user.languageCode,
    },
    appUser: {
      id: loaded.appUser.id,
      openCount: loaded.appUser.openCount,
      firstSeen: loaded.firstSeen,
    },
    usage: loaded.usage,
    mock: loaded.auth.mock,
  };
}

export async function createSession(
  request: Request,
  config: AppConfig,
  feature = primaryUsageFeature(config),
): Promise<MiniSession> {
  const loaded = await loadIdentity(request, config, feature);
  const referred = await attributeReferral({
    config,
    appId: loaded.app.id,
    refereeId: loaded.user.id,
    startParam: loaded.auth.startParam,
  });
  if (config.analytics.enabled) {
    await track({
      appId: loaded.app.id,
      userId: loaded.user.id,
      name: "app_open",
      metadata: { mock: loaded.auth.mock },
    });
    if (loaded.firstSeen) {
      await track({
        appId: loaded.app.id,
        userId: loaded.user.id,
        name: "first_open",
        metadata: { mock: loaded.auth.mock },
      });
    }
    if (referred) {
      await track({
        appId: loaded.app.id,
        userId: loaded.user.id,
        name: "referral_open",
        metadata: { startParam: loaded.auth.startParam ?? null },
      });
    }
  }
  return {
    app: { id: loaded.app.id, slug: loaded.app.slug, name: loaded.app.name },
    user: {
      id: loaded.user.id,
      telegramId: loaded.user.telegramId,
      firstName: loaded.user.firstName,
      languageCode: loaded.user.languageCode,
    },
    appUser: {
      id: loaded.appUser.id,
      openCount: loaded.appUser.openCount,
      firstSeen: loaded.firstSeen,
    },
    usage: loaded.usage,
    mock: loaded.auth.mock,
  };
}
