import type { AppConfig } from "@minifactory/config";
import { prisma, Prisma } from "@minifactory/db";
import {
  answerPreCheckoutQuery as telegramAnswerPreCheckoutQuery,
  createInvoiceLink as telegramCreateInvoiceLink,
  refundStarPayment as telegramRefundStarPayment,
} from "@minifactory/telegram/server";
import {
  clipInvoiceTitle,
  grantFromProduct,
  invoicePayload,
  parseInvoicePayload,
  PaymentConfigError,
  requireStarsProduct,
  STARS_CURRENCY,
  type PurchaseGrant,
} from "./catalog";
import { grantCredits } from "./credits";
import { getActivePeriodEntitlement, getEntitlements, grantPeriodEntitlement } from "./entitlements";

export type StarsBridge = {
  createInvoiceLink: typeof telegramCreateInvoiceLink;
  answerPreCheckoutQuery: typeof telegramAnswerPreCheckoutQuery;
  refundStarPayment: typeof telegramRefundStarPayment;
};

const defaultBridge: StarsBridge = {
  createInvoiceLink: telegramCreateInvoiceLink,
  answerPreCheckoutQuery: telegramAnswerPreCheckoutQuery,
  refundStarPayment: telegramRefundStarPayment,
};

export type TelegramSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
};

export type TelegramPreCheckoutQuery = {
  id: string;
  from?: { id?: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
};

export async function createStarsInvoice(input: {
  config: AppConfig;
  appId: string;
  userId: string;
  productId: string;
  creditFeature: string;
  bridge?: StarsBridge;
}): Promise<{ invoiceLink: string; orderId: string; payload: string; stars: number }> {
  const product = requireStarsProduct(input.config, input.productId);
  const grant = grantFromProduct(product, input.creditFeature);
  const purchase = await prisma.purchase.create({
    data: {
      appId: input.appId,
      userId: input.userId,
      productId: product.id,
      provider: "telegram_stars",
      amount: product.priceStars,
      currency: STARS_CURRENCY,
      status: "pending",
      grant: grant as unknown as Prisma.InputJsonValue,
    },
  });
  const payload = invoicePayload(input.config.slug, purchase.id);
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { payload },
  });

  const bridge = input.bridge ?? defaultBridge;
  try {
    const invoiceLink = await bridge.createInvoiceLink({
      title: clipInvoiceTitle(product.title),
      description: product.description.slice(0, 255),
      payload,
      currency: STARS_CURRENCY,
      prices: [{ label: clipInvoiceTitle(product.title), amount: product.priceStars }],
    });
    return { invoiceLink, orderId: purchase.id, payload, stars: product.priceStars };
  } catch (error) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "failed" },
    });
    throw error;
  }
}

export async function answerPreCheckout(input: {
  config: AppConfig;
  query: TelegramPreCheckoutQuery;
  creditFeature: string;
  bridge?: StarsBridge;
}): Promise<{ ok: boolean }> {
  const bridge = input.bridge ?? defaultBridge;
  const parsed = parseInvoicePayload(input.query.invoice_payload);
  let ok = false;
  let errorMessage = "This purchase is no longer valid.";
  try {
    if (!parsed || parsed.appSlug !== input.config.slug) {
      throw new PaymentConfigError("Unknown app for this invoice", "mismatch");
    }
    const purchase = await prisma.purchase.findUnique({ where: { id: parsed.orderId } });
    if (!purchase || purchase.payload !== input.query.invoice_payload || purchase.status !== "pending") {
      throw new PaymentConfigError("Unknown order", "invalid_order");
    }
    const product = requireStarsProduct(input.config, purchase.productId);
    grantFromProduct(product, input.creditFeature);
    if (input.query.currency !== STARS_CURRENCY || purchase.currency !== STARS_CURRENCY) {
      throw new PaymentConfigError("Wrong currency", "mismatch");
    }
    if (input.query.total_amount !== purchase.amount || purchase.amount !== product.priceStars) {
      throw new PaymentConfigError("Wrong amount", "mismatch");
    }
    if (typeof input.query.from?.id === "number") {
      const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
      if (!user || user.telegramId !== String(input.query.from.id)) {
        throw new PaymentConfigError("Wrong purchaser", "mismatch");
      }
    }
    ok = true;
  } catch (error) {
    if (error instanceof PaymentConfigError) {
      errorMessage = error.message;
    }
    ok = false;
  }
  await bridge.answerPreCheckoutQuery({
    preCheckoutQueryId: input.query.id,
    ok,
    errorMessage: ok ? undefined : errorMessage,
  });
  return { ok };
}

export async function handleSuccessfulPayment(input: {
  config: AppConfig;
  payment: TelegramSuccessfulPayment;
  creditFeature: string;
  telegramUserId?: number;
}): Promise<{ granted: boolean; duplicate: boolean; purchaseId: string }> {
  const parsed = parseInvoicePayload(input.payment.invoice_payload);
  if (!parsed || parsed.appSlug !== input.config.slug) {
    throw new PaymentConfigError("Wrong app for this payment", "mismatch");
  }
  const purchase = await prisma.purchase.findUnique({ where: { id: parsed.orderId } });
  if (!purchase || purchase.payload !== input.payment.invoice_payload) {
    throw new PaymentConfigError("Unknown order", "invalid_order");
  }
  if (input.payment.currency !== STARS_CURRENCY || purchase.currency !== STARS_CURRENCY) {
    throw new PaymentConfigError("Wrong currency", "mismatch");
  }
  const product = requireStarsProduct(input.config, purchase.productId);
  if (input.payment.total_amount !== purchase.amount || purchase.amount !== product.priceStars) {
    throw new PaymentConfigError("Wrong amount", "mismatch");
  }
  if (typeof input.telegramUserId === "number") {
    const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
    if (!user || user.telegramId !== String(input.telegramUserId)) {
      throw new PaymentConfigError("Wrong purchaser", "mismatch");
    }
  }

  const grant = grantFromProduct(product, input.creditFeature);
  let duplicate = false;
  let granted = false;

  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT id, status
        FROM "Purchase"
        WHERE id = ${purchase.id}
        FOR UPDATE
      `);
      const locked = rows[0];
      if (!locked) {
        throw new PaymentConfigError("Unknown order", "invalid_order");
      }
      if (locked.status === "completed") {
        duplicate = true;
        return;
      }
      if (locked.status !== "pending") {
        throw new PaymentConfigError("Order cannot be fulfilled", "invalid_order");
      }

      const existingCharge = await tx.purchase.findUnique({
        where: { telegramPaymentChargeId: input.payment.telegram_payment_charge_id },
      });
      if (existingCharge && existingCharge.id !== purchase.id) {
        throw new PaymentConfigError("Charge already used", "mismatch");
      }

      if (grant.kind === "credits") {
        await grantCredits({
          appId: purchase.appId,
          userId: purchase.userId,
          feature: grant.feature,
          amount: grant.credits,
          tx,
        });
      } else {
        await grantPeriodEntitlement({
          appId: purchase.appId,
          userId: purchase.userId,
          productId: grant.productId,
          periodDays: grant.periodDays,
          tx,
        });
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "completed",
          telegramPaymentChargeId: input.payment.telegram_payment_charge_id,
          providerPaymentChargeId: input.payment.provider_payment_charge_id ?? null,
          externalPaymentId: input.payment.telegram_payment_charge_id,
          fulfilledAt: new Date(),
          grant: grant as unknown as Prisma.InputJsonValue,
        },
      });
      granted = true;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.purchase.findUnique({
        where: { telegramPaymentChargeId: input.payment.telegram_payment_charge_id },
      });
      if (existing?.status === "completed") {
        return { granted: false, duplicate: true, purchaseId: existing.id };
      }
    }
    throw error;
  }

  return { granted, duplicate, purchaseId: purchase.id };
}

export async function refundStarsPayment(input: {
  purchaseId: string;
  telegramUserId: number;
  bridge?: StarsBridge;
}): Promise<{ refunded: boolean }> {
  const purchase = await prisma.purchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase?.telegramPaymentChargeId) {
    throw new PaymentConfigError("Purchase cannot be refunded", "invalid_order");
  }
  if (purchase.status === "refunded") {
    return { refunded: true };
  }
  const bridge = input.bridge ?? defaultBridge;
  await bridge.refundStarPayment({
    userId: input.telegramUserId,
    telegramPaymentChargeId: purchase.telegramPaymentChargeId,
  });
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { status: "refunded" },
  });
  return { refunded: true };
}

export async function listPurchases(appId: string, userId: string) {
  return prisma.purchase.findMany({
    where: { appId, userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      productId: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
      fulfilledAt: true,
    },
  });
}

export async function getPurchaseForUser(appId: string, userId: string, orderId: string) {
  return prisma.purchase.findFirst({
    where: { id: orderId, appId, userId },
    select: {
      id: true,
      productId: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
      fulfilledAt: true,
    },
  });
}

export { getActivePeriodEntitlement, getEntitlements };
export type { PurchaseGrant };
