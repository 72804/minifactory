import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defineAppConfig } from "@minifactory/config";
import { isExampleDatabaseUrl } from "@minifactory/config/security";
import { prisma } from "@minifactory/db";
import { grantCredits, grantPeriodEntitlement } from "@minifactory/payments";
import { consumeAccess, getAccessStatus, PaymentRequiredError, refundAccess } from "./access";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

function dbReady(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !isExampleDatabaseUrl(url));
}

const appConfig = defineAppConfig({
  id: "lensmini",
  name: "LensMini",
  slug: "lensmini",
  description: "Translate text instantly with your camera.",
  botUsername: "LensMiniBot",
  productionUrl: "https://lensmini.vercel.app",
  theme: { accent: "#7c5cff", radius: "16px", fontFamily: "system-ui" },
  listing: { shortDescription: "test", longDescription: "test", category: "translation", keywords: [] },
  capabilities: ["telegramAuth", "database", "payments"],
  limits: {
    anonymousUsage: false,
    features: { translate: { freePerDay: 5, extraAfterAd: 0, premiumUnlimited: false, unlimited: false } },
  },
  monetization: {
    enabled: true,
    currency: "XTR",
    products: [
      { id: "lens_20", title: "20 Translations", description: "20 extra translations", priceStars: 49, type: "consumable", grantCredits: 20 },
      { id: "lens_100", title: "100 Translations", description: "100 extra translations", priceStars: 149, type: "consumable", grantCredits: 100, badge: "BEST VALUE" },
      { id: "lens_pro_30d", title: "LensMini Pro — 30 Days", description: "100 translations/day for 30 days", priceStars: 299, type: "period_entitlement", periodDays: 30, dailyLimit: 100 },
    ],
  },
});

async function seed(prefix: string) {
  const app = await prisma.app.upsert({
    where: { slug: "lensmini" },
    update: { name: "LensMini" },
    create: { slug: "lensmini", name: "LensMini" },
  });
  const user = await prisma.user.create({
    data: { telegramId: `${prefix}-${Date.now()}-${Math.random()}`, firstName: prefix },
  });
  return { app, user };
}

const consume = (appId: string, userId: string) =>
  consumeAccess({ config: appConfig, appId, userId, feature: "translate" });

describe.skipIf(!dbReady())("LensMini access order", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("consumes free quota before purchased credits", async () => {
    const { app, user } = await seed("free-first");
    await grantCredits({ appId: app.id, userId: user.id, feature: "translate", amount: 5 });
    for (let i = 0; i < 5; i += 1) {
      const used = await consume(app.id, user.id);
      expect(used.source).toBe("free");
    }
    const status = await getAccessStatus({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      feature: "translate",
    });
    expect(status.freeRemaining).toBe(0);
    expect(status.credits).toBe(5);
    const credit = await consume(app.id, user.id);
    expect(credit.source).toBe("credit");
    expect(credit.credits).toBe(4);
  });

  it("uses the Pro daily allowance while Pro is active", async () => {
    const { app, user } = await seed("pro-day");
    await grantPeriodEntitlement({
      appId: app.id,
      userId: user.id,
      productId: "lens_pro_30d",
      periodDays: 30,
    });
    const used = await consume(app.id, user.id);
    expect(used.source).toBe("pro");
    const counter = await prisma.usageCounter.findFirst({
      where: { appId: app.id, userId: user.id, feature: "translate_pro" },
    });
    expect(counter?.count).toBe(1);
    const free = await prisma.usageCounter.findFirst({
      where: { appId: app.id, userId: user.id, feature: "translate" },
    });
    expect(free?.count ?? 0).toBe(0);
  });

  it("falls back to free access after Pro expires", async () => {
    const { app, user } = await seed("pro-exp");
    await prisma.entitlement.create({
      data: {
        appId: app.id,
        userId: user.id,
        productId: "lens_pro_30d",
        status: "active",
        startsAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    const used = await consume(app.id, user.id);
    expect(used.source).toBe("free");
    expect(used.proActive).toBe(false);
  });

  it("refunds free, purchased, and Pro allowance independently", async () => {
    const { app, user } = await seed("refund");
    const free = await consume(app.id, user.id);
    await refundAccess({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      feature: "translate",
      source: free.source ?? "free",
    });
    expect(
      (
        await getAccessStatus({
          config: appConfig,
          appId: app.id,
          userId: user.id,
          feature: "translate",
        })
      ).freeRemaining,
    ).toBe(5);

    await grantCredits({ appId: app.id, userId: user.id, feature: "translate", amount: 1 });
    for (let i = 0; i < 5; i += 1) {
      await consume(app.id, user.id);
    }
    const credit = await consume(app.id, user.id);
    expect(credit.source).toBe("credit");
    await refundAccess({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      feature: "translate",
      source: "credit",
    });
    expect(
      (await getAccessStatus({ config: appConfig, appId: app.id, userId: user.id, feature: "translate" })).credits,
    ).toBe(1);

    await grantPeriodEntitlement({
      appId: app.id,
      userId: user.id,
      productId: "lens_pro_30d",
      periodDays: 30,
    });
    const pro = await consume(app.id, user.id);
    expect(pro.source).toBe("pro");
    await refundAccess({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      feature: "translate",
      source: "pro",
    });
    const after = await getAccessStatus({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      feature: "translate",
    });
    expect(after.proRemainingToday).toBe(100);
  });

  it("allows only one concurrent consume of the last purchased credit", async () => {
    const { app, user } = await seed("race");
    for (let i = 0; i < 5; i += 1) {
      await consume(app.id, user.id);
    }
    await grantCredits({ appId: app.id, userId: user.id, feature: "translate", amount: 1 });
    const racing = await Promise.allSettled([consume(app.id, user.id), consume(app.id, user.id)]);
    const ok = racing.filter((item) => item.status === "fulfilled").length;
    const denied = racing.filter(
      (item) => item.status === "rejected" && item.reason instanceof PaymentRequiredError,
    ).length;
    expect(ok).toBe(1);
    expect(denied).toBe(1);
  });

  it("does not let user B spend user A credits", async () => {
    const a = await seed("own-a");
    const b = await seed("own-b");
    await grantCredits({ appId: a.app.id, userId: a.user.id, feature: "translate", amount: 3 });
    for (let i = 0; i < 5; i += 1) {
      await consume(b.app.id, b.user.id);
    }
    await expect(consume(b.app.id, b.user.id)).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(
      (await getAccessStatus({ config: appConfig, appId: a.app.id, userId: a.user.id, feature: "translate" })).credits,
    ).toBe(3);
  });
});
