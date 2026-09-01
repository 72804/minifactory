import type { AppConfig } from "@minifactory/config";
import { track } from "@minifactory/analytics/server";
import {
  createStarsInvoice,
  getPurchaseForUser,
  listPurchases,
  PaymentConfigError,
} from "@minifactory/payments";
import { TelegramAuthError } from "@minifactory/telegram/server";
import { z } from "zod";
import { requireIdentity } from "./session";
import { primaryUsageFeature } from "./usage";

const invoiceBodySchema = z.object({
  productId: z.string().min(1),
});

function jsonError(error: unknown, app?: string): Response {
  if (error instanceof TelegramAuthError) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof PaymentConfigError) {
    const status = error.code === "unknown_product" ? 404 : 400;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  console.info("[minifactory] payment_request_failed", { app: app ?? null });
  return Response.json({ error: "Could not start purchase" }, { status: 500 });
}

export function createInvoiceRoute(config: AppConfig) {
  return {
    POST: async (request: Request) => {
      try {
        const session = await requireIdentity(request, config);
        const parsedJson: unknown = await request.json();
        const parsed = invoiceBodySchema.safeParse(parsedJson);
        if (!parsed.success) {
          return Response.json({ error: "Unknown product", code: "unknown_product" }, { status: 400 });
        }
        const created = await createStarsInvoice({
          config,
          appId: session.app.id,
          userId: session.user.id,
          productId: parsed.data.productId,
          creditFeature: primaryUsageFeature(config),
        });
        if (config.analytics.enabled) {
          await track({
            appId: session.app.id,
            userId: session.user.id,
            name: "invoice_created",
            metadata: { productId: parsed.data.productId, stars: created.stars },
          });
        }
        return Response.json({
          invoiceLink: created.invoiceLink,
          orderId: created.orderId,
          productId: parsed.data.productId,
          stars: created.stars,
        });
      } catch (error) {
        return jsonError(error, config.slug);
      }
    },
  };
}

export function createPurchaseHistoryRoute(config: AppConfig) {
  return {
    GET: async (request: Request) => {
      try {
        const session = await requireIdentity(request, config);
        const rows = await listPurchases(session.app.id, session.user.id);
        const titles = new Map(config.monetization.products.map((product) => [product.id, product.title]));
        return Response.json({
          items: rows.map((row) => ({
            product: titles.get(row.productId) ?? row.productId,
            stars: row.amount,
            currency: row.currency,
            status: row.status,
            date: row.fulfilledAt ?? row.createdAt,
          })),
        });
      } catch (error) {
        return jsonError(error, config.slug);
      }
    },
  };
}

export function createPurchaseStatusRoute(config: AppConfig) {
  return {
    GET: async (request: Request) => {
      try {
        const session = await requireIdentity(request, config);
        const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
        if (!orderId) {
          return Response.json({ error: "Missing order" }, { status: 400 });
        }
        const purchase = await getPurchaseForUser(session.app.id, session.user.id, orderId);
        if (!purchase) {
          return Response.json({ error: "Unknown order" }, { status: 404 });
        }
        return Response.json(purchase);
      } catch (error) {
        return jsonError(error, config.slug);
      }
    },
  };
}
