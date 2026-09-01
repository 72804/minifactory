import type { MonetizationProduct } from "@minifactory/config";
import { prisma } from "@minifactory/db";

export type PaymentProvider = "telegram_stars" | "mock";

export type CreateInvoiceInput = {
  appId: string;
  userId: string;
  product: MonetizationProduct;
  provider?: PaymentProvider;
};

export type ConfirmedPayment = {
  appId: string;
  userId: string;
  productId: string;
  provider: PaymentProvider;
  externalPaymentId: string;
  amount: number;
  currency: string;
};

export async function createPendingPurchase(input: CreateInvoiceInput) {
  return prisma.purchase.create({
    data: {
      appId: input.appId,
      userId: input.userId,
      productId: input.product.id,
      provider: input.provider ?? "telegram_stars",
      amount: input.product.priceStars,
      currency: "XTR",
      status: "pending",
    },
  });
}

/**
 * Grant entitlements only from a confirmed Telegram Stars webhook / Bot API event.
 * Never trust Mini App client payment callbacks.
 */
export async function confirmPayment(input: ConfirmedPayment) {
  return prisma.purchase.upsert({
    where: {
      provider_externalPaymentId: {
        provider: input.provider,
        externalPaymentId: input.externalPaymentId,
      },
    },
    update: {
      status: "completed",
      amount: input.amount,
      currency: input.currency,
    },
    create: {
      appId: input.appId,
      userId: input.userId,
      productId: input.productId,
      provider: input.provider,
      externalPaymentId: input.externalPaymentId,
      amount: input.amount,
      currency: input.currency,
      status: "completed",
    },
  });
}

export async function hasPaidProduct(appId: string, userId: string, productId: string): Promise<boolean> {
  const purchase = await prisma.purchase.findFirst({
    where: { appId, userId, productId, status: { in: ["paid", "completed"] } },
    select: { id: true },
  });
  return Boolean(purchase);
}

/**
 * Development helper. Production payment grants must come from Telegram webhooks.
 */
export async function completeMockPurchase(input: Omit<ConfirmedPayment, "provider">) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock purchases are disabled in production");
  }
  return confirmPayment({ ...input, provider: "mock" });
}
