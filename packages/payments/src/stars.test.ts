import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defineAppConfig } from "@minifactory/config";
import { isExampleDatabaseUrl } from "@minifactory/config/security";
import { prisma } from "@minifactory/db";
import {
  answerPreCheckout,
  completeMockPurchase,
  consumeCredit,
  createStarsInvoice,
  CreditLimitError,
  getCreditBalance,
  handleSuccessfulPayment,
  PaymentConfigError,
  refundCredit,
} from "./index";

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

const bridge = {
  createInvoiceLink: async () => "https://t.me/$invoice-test",
  answerPreCheckoutQuery: async () => ({}),
  refundStarPayment: async () => ({}),
};

async function seedUser(prefix: string) {
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

describe.skipIf(!dbReady())("Telegram Stars payments", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates invoices from catalog prices, not client-provided amounts", async () => {
    const { app, user } = await seedUser("inv");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    const purchase = await prisma.purchase.findUnique({ where: { id: created.orderId } });
    expect(created.stars).toBe(49);
    expect(purchase?.amount).toBe(49);
    expect(purchase?.currency).toBe("XTR");
    expect(purchase?.status).toBe("pending");
  });

  it("rejects unknown products", async () => {
    const { app, user } = await seedUser("unk");
    await expect(
      createStarsInvoice({
        config: appConfig,
        appId: app.id,
        userId: user.id,
        productId: "not_a_product",
        creditFeature: "translate",
        bridge,
      }),
    ).rejects.toBeInstanceOf(PaymentConfigError);
  });

  it("rejects a successful_payment for the wrong app", async () => {
    const { app, user } = await seedUser("app");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    await expect(
      handleSuccessfulPayment({
        config: { ...appConfig, slug: "demo" },
        creditFeature: "translate",
        payment: {
          currency: "XTR",
          total_amount: 49,
          invoice_payload: created.payload,
          telegram_payment_charge_id: `chg-${created.orderId}`,
        },
      }),
    ).rejects.toMatchObject({ code: "mismatch" });
  });

  it("rejects wrong currency and wrong Star amount", async () => {
    const { app, user } = await seedUser("amt");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    await expect(
      handleSuccessfulPayment({
        config: appConfig,
        creditFeature: "translate",
        payment: {
          currency: "USD",
          total_amount: 49,
          invoice_payload: created.payload,
          telegram_payment_charge_id: `usd-${created.orderId}`,
        },
      }),
    ).rejects.toMatchObject({ code: "mismatch" });
    await expect(
      handleSuccessfulPayment({
        config: appConfig,
        creditFeature: "translate",
        payment: {
          currency: "XTR",
          total_amount: 1,
          invoice_payload: created.payload,
          telegram_payment_charge_id: `amt-${created.orderId}`,
        },
      }),
    ).rejects.toMatchObject({ code: "mismatch" });
  });

  it("accepts a valid pre-checkout and rejects an invalid order", async () => {
    const { app, user } = await seedUser("pre");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    const answers: boolean[] = [];
    const recording = {
      ...bridge,
      answerPreCheckoutQuery: async (input: { ok: boolean }) => {
        answers.push(input.ok);
      },
    };
    const ok = await answerPreCheckout({
      config: appConfig,
      creditFeature: "translate",
      bridge: recording,
      query: {
        id: "pq-ok",
        currency: "XTR",
        total_amount: 49,
        invoice_payload: created.payload,
        from: { id: Number(user.telegramId) || undefined },
      },
    });
    const bad = await answerPreCheckout({
      config: appConfig,
      creditFeature: "translate",
      bridge: recording,
      query: {
        id: "pq-bad",
        currency: "XTR",
        total_amount: 49,
        invoice_payload: "lensmini:does-not-exist",
      },
    });
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(answers).toEqual([true, false]);
  });

  it("grants 20 credits exactly once for duplicate successful_payment", async () => {
    const { app, user } = await seedUser("g20");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    const payment = {
      currency: "XTR" as const,
      total_amount: 49,
      invoice_payload: created.payload,
      telegram_payment_charge_id: `once-${created.orderId}`,
    };
    const first = await handleSuccessfulPayment({ config: appConfig, creditFeature: "translate", payment });
    const second = await handleSuccessfulPayment({ config: appConfig, creditFeature: "translate", payment });
    expect(first.granted).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(await getCreditBalance(app.id, user.id, "translate")).toBe(20);
  });

  it("grants 100 credits for the 100 pack", async () => {
    const { app, user } = await seedUser("g100");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_100",
      creditFeature: "translate",
      bridge,
    });
    await handleSuccessfulPayment({
      config: appConfig,
      creditFeature: "translate",
      payment: {
        currency: "XTR",
        total_amount: 149,
        invoice_payload: created.payload,
        telegram_payment_charge_id: `100-${created.orderId}`,
      },
    });
    expect(await getCreditBalance(app.id, user.id, "translate")).toBe(100);
  });

  it("activates Pro for 30 days", async () => {
    const { app, user } = await seedUser("pro");
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_pro_30d",
      creditFeature: "translate",
      bridge,
    });
    const before = Date.now();
    await handleSuccessfulPayment({
      config: appConfig,
      creditFeature: "translate",
      payment: {
        currency: "XTR",
        total_amount: 299,
        invoice_payload: created.payload,
        telegram_payment_charge_id: `pro-${created.orderId}`,
      },
    });
    const entitlement = await prisma.entitlement.findFirst({ where: { appId: app.id, userId: user.id } });
    expect(entitlement?.productId).toBe("lens_pro_30d");
    const duration = (entitlement?.expiresAt?.getTime() ?? 0) - (entitlement?.startsAt.getTime() ?? 0);
    expect(duration).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    expect(duration).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
    expect((entitlement?.startsAt.getTime() ?? 0) >= before - 5_000).toBe(true);
  });

  it("keeps credits app-scoped", async () => {
    const { app, user } = await seedUser("iso");
    const demo = await prisma.app.upsert({
      where: { slug: "demo" },
      update: {},
      create: { slug: "demo", name: "Demo Mini" },
    });
    const created = await createStarsInvoice({
      config: appConfig,
      appId: app.id,
      userId: user.id,
      productId: "lens_20",
      creditFeature: "translate",
      bridge,
    });
    await handleSuccessfulPayment({
      config: appConfig,
      creditFeature: "translate",
      payment: {
        currency: "XTR",
        total_amount: 49,
        invoice_payload: created.payload,
        telegram_payment_charge_id: `iso-${created.orderId}`,
      },
    });
    expect(await getCreditBalance(demo.id, user.id, "translate")).toBe(0);
    await expect(consumeCredit({ appId: demo.id, userId: user.id, feature: "translate" })).rejects.toBeInstanceOf(
      CreditLimitError,
    );
    expect(await getCreditBalance(app.id, user.id, "translate")).toBe(20);
  });

  it("refunds a purchased credit onto the same ledger", async () => {
    const { app, user } = await seedUser("ref");
    await prisma.creditBalance.create({
      data: { appId: app.id, userId: user.id, feature: "translate", balance: 1 },
    });
    await consumeCredit({ appId: app.id, userId: user.id, feature: "translate" });
    await refundCredit({ appId: app.id, userId: user.id, feature: "translate" });
    expect(await getCreditBalance(app.id, user.id, "translate")).toBe(1);
  });

  it("blocks mock purchases in production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await expect(
      completeMockPurchase({
        appId: "x",
        userId: "y",
        productId: "lens_20",
        externalPaymentId: "mock",
        amount: 49,
        currency: "XTR",
      }),
    ).rejects.toThrow(/disabled in production/);
    process.env.NODE_ENV = previous;
  });
});
