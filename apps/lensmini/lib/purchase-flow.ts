import { factoryFetch } from "@minifactory/core/shell";
import { clientInvoiceStatusMayGrant, openInvoice, type InvoiceClosedStatus } from "@minifactory/telegram/client";

export type InvoiceResult =
  | { status: "cancelled" }
  | { status: "failed"; message: string }
  | { status: "pending"; message: string }
  | { status: "completed"; productId: string }
  | { status: "delayed"; productId: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function startProductPurchase(productId: string): Promise<InvoiceResult> {
  const invoiceResponse = await factoryFetch("/api/payments/invoice", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
  const invoice = (await invoiceResponse.json()) as {
    invoiceLink?: string;
    orderId?: string;
    error?: string;
  };
  if (!invoiceResponse.ok || !invoice.invoiceLink || !invoice.orderId) {
    return { status: "failed", message: invoice.error ?? "Payment didn't go through." };
  }

  const closed: InvoiceClosedStatus = await openInvoice(invoice.invoiceLink);
  if (clientInvoiceStatusMayGrant(closed)) {
    return { status: "failed", message: "Payment didn't go through." };
  }
  if (closed === "cancelled") {
    return { status: "cancelled" };
  }
  if (closed === "failed") {
    return { status: "failed", message: "Payment didn't go through." };
  }
  if (closed === "pending") {
    return { status: "pending", message: "Payment is processing…" };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const statusResponse = await factoryFetch(`/api/payments/order?orderId=${encodeURIComponent(invoice.orderId)}`);
    const order = (await statusResponse.json()) as { status?: string; productId?: string };
    if (order.status === "completed") {
      return { status: "completed", productId: order.productId ?? productId };
    }
    await sleep(400);
  }
  return { status: "delayed", productId };
}

export function purchaseSuccessCopy(productId: string): string {
  if (productId === "lens_20") {
    return "20 translations added.";
  }
  if (productId === "lens_100") {
    return "100 translations added.";
  }
  if (productId === "lens_pro_30d") {
    return "LensMini Pro activated for 30 days.";
  }
  return "Purchase activated.";
}
