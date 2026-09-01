import type { AppConfig, MonetizationProduct } from "@minifactory/config";

export const STARS_CURRENCY = "XTR" as const;

export type PurchaseGrant =
  | { kind: "credits"; feature: string; credits: number }
  | { kind: "entitlement"; productId: string; periodDays: number; dailyLimit: number };

export function invoicePayload(appSlug: string, orderId: string): string {
  return `${appSlug}:${orderId}`;
}

export function parseInvoicePayload(payload: string): { appSlug: string; orderId: string } | null {
  const separator = payload.indexOf(":");
  if (separator <= 0 || separator === payload.length - 1) {
    return null;
  }
  return { appSlug: payload.slice(0, separator), orderId: payload.slice(separator + 1) };
}

export function findProduct(
  products: MonetizationProduct[],
  productId: string,
): MonetizationProduct | undefined {
  return products.find((product) => product.id === productId);
}

export function grantFromProduct(product: MonetizationProduct, feature: string): PurchaseGrant {
  if (product.type === "consumable") {
    const credits = product.grantCredits;
    if (!credits) {
      throw new Error(`Product ${product.id} is missing grantCredits`);
    }
    return { kind: "credits", feature, credits };
  }
  if (product.type === "period_entitlement") {
    if (!product.periodDays || !product.dailyLimit) {
      throw new Error(`Product ${product.id} is missing periodDays or dailyLimit`);
    }
    return {
      kind: "entitlement",
      productId: product.id,
      periodDays: product.periodDays,
      dailyLimit: product.dailyLimit,
    };
  }
  throw new Error(`Unsupported product type: ${product.id}`);
}

export function clipInvoiceTitle(title: string): string {
  if (title.length <= 32) {
    return title;
  }
  return title.slice(0, 31).trimEnd();
}

export function requireStarsProduct(config: AppConfig, productId: string): MonetizationProduct {
  if (!config.monetization.enabled) {
    throw new PaymentConfigError("Monetization is disabled", "disabled");
  }
  if (config.monetization.currency !== STARS_CURRENCY) {
    throw new PaymentConfigError("Only Telegram Stars (XTR) are supported", "currency");
  }
  const product = findProduct(config.monetization.products, productId);
  if (!product) {
    throw new PaymentConfigError("Unknown product", "unknown_product");
  }
  return product;
}

export class PaymentConfigError extends Error {
  constructor(
    message: string,
    public code: "disabled" | "currency" | "unknown_product" | "invalid_order" | "mismatch",
  ) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

export class CreditLimitError extends Error {
  constructor(public balance: number) {
    super("No purchased credits remaining");
    this.name = "CreditLimitError";
  }
}
