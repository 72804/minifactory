import type { AppConfig } from "@minifactory/config";
import { getServerEnv } from "@minifactory/config/env";
import { track } from "@minifactory/analytics/server";
import {
  answerPreCheckout,
  handleSuccessfulPayment,
  PaymentConfigError,
} from "@minifactory/payments";
import {
  resolveTelegramPresentation,
  sendTelegramMessage,
  sendTelegramPhoto,
  TelegramAuthError,
  verifyTelegramWebhookSecret,
} from "@minifactory/telegram/server";
import { prisma } from "@minifactory/db";
import { primaryUsageFeature } from "./usage";

export type TelegramStartCopy = {
  text: string;
  buttonText: string;
};

const recentUpdateIds = new Set<number>();
const RECENT_LIMIT = 200;

function rememberUpdate(id: number): boolean {
  if (recentUpdateIds.has(id)) {
    return false;
  }
  recentUpdateIds.add(id);
  if (recentUpdateIds.size > RECENT_LIMIT) {
    const first = recentUpdateIds.values().next().value;
    if (typeof first === "number") {
      recentUpdateIds.delete(first);
    }
  }
  return true;
}

export function defaultTelegramStartCopy(config: AppConfig): TelegramStartCopy {
  const presentation = resolveTelegramPresentation(config);
  return {
    text: presentation.startText,
    buttonText: presentation.startButtonText,
  };
}

export function miniAppUrl(): string {
  return getServerEnv().APP_BASE_URL.replace(/\/$/, "");
}

export function telegramPublicAssetUrl(appBaseUrl: string, assetPath: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  const path = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${base}${path}`;
}

export function publicPageUrl(config: AppConfig, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${miniAppUrl()}${suffix}`;
}

export function paymentSupportMessage(config: AppConfig): string {
  const contact = config.supportContact.trim();
  const contactLine = contact
    ? `Contact: ${contact}`
    : "Contact: reply here with your purchase details.";
  return [
    `Need help with a ${config.name} purchase?`,
    contactLine,
    "",
    "Please include the approximate purchase time and product.",
    `Telegram support cannot resolve purchases made through ${config.name}.`,
  ].join("\n");
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number };
    from?: { id?: number };
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
  };
  pre_checkout_query?: {
    id: string;
    from?: { id?: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
};

export function parseBotCommand(text: string | undefined): string | null {
  if (!text) {
    return null;
  }
  const match = /^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s|$)/.exec(text.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function isStartCommand(text: string | undefined): boolean {
  return parseBotCommand(text) === "start";
}

export function webAppInlineKeyboard(buttonText: string, url: string) {
  return {
    inline_keyboard: [[{ text: buttonText, web_app: { url } }]],
  };
}

function privacyReply(config: AppConfig, presentationPrivacy?: string): string {
  const url = publicPageUrl(config, config.privacyUrl);
  if (presentationPrivacy) {
    return `${presentationPrivacy}\n\n${url}`;
  }
  return `Privacy information:\n${url}`;
}

async function fulfillSuccessfulPayment(config: AppConfig, update: TelegramUpdate): Promise<boolean> {
  const payment = update.message?.successful_payment;
  if (!payment) {
    return false;
  }
  try {
    const result = await handleSuccessfulPayment({
      config,
      payment,
      creditFeature: primaryUsageFeature(config),
      telegramUserId: update.message?.from?.id,
    });
    if (result.granted && config.analytics.enabled) {
      const parsed = payment.invoice_payload.split(":")[1];
      const purchase = parsed
        ? await prisma.purchase.findUnique({ where: { id: parsed }, select: { appId: true, userId: true, productId: true, amount: true } })
        : null;
      if (purchase) {
        await track({
          appId: purchase.appId,
          userId: purchase.userId,
          name: "purchase_completed",
          metadata: { productId: purchase.productId, stars: purchase.amount },
        });
      }
    }
  } catch (error) {
    if (error instanceof PaymentConfigError) {
      console.info("[minifactory] payment_fulfill_rejected", { app: config.slug, code: error.code });
      return true;
    }
    console.info("[minifactory] payment_fulfill_failed", { app: config.slug });
  }
  return true;
}

export async function handleTelegramBotUpdate(
  config: AppConfig,
  update: TelegramUpdate,
  copy: TelegramStartCopy = defaultTelegramStartCopy(config),
): Promise<{ handled: boolean; duplicate: boolean }> {
  if (update.pre_checkout_query) {
    await answerPreCheckout({
      config,
      query: update.pre_checkout_query,
      creditFeature: primaryUsageFeature(config),
    });
    return { handled: true, duplicate: false };
  }

  if (update.message?.successful_payment) {
    const handled = await fulfillSuccessfulPayment(config, update);
    return { handled, duplicate: false };
  }

  const updateId = update.update_id;
  if (typeof updateId === "number" && !rememberUpdate(updateId)) {
    return { handled: false, duplicate: true };
  }
  const command = parseBotCommand(update.message?.text);
  const chatId = update.message?.chat?.id;
  if (!command || typeof chatId !== "number") {
    return { handled: false, duplicate: false };
  }
  const url = miniAppUrl();
  const presentation = resolveTelegramPresentation(config);
  if (command === "start") {
    const markup = webAppInlineKeyboard(copy.buttonText, url);
    const photoPath = presentation.startPhoto;
    if (photoPath) {
      try {
        await sendTelegramPhoto(chatId, telegramPublicAssetUrl(url, photoPath), {
          caption: copy.text,
          replyMarkup: markup,
        });
        console.info("[minifactory] telegram_start", { app: config.slug, hasChat: true, photo: true });
        return { handled: true, duplicate: false };
      } catch {
        console.info("[minifactory] telegram_start_photo_failed", { app: config.slug });
      }
    }
    await sendTelegramMessage(chatId, copy.text, { replyMarkup: markup });
    console.info("[minifactory] telegram_start", { app: config.slug, hasChat: true, photo: false });
    return { handled: true, duplicate: false };
  }
  if (command === "help" && presentation.helpText) {
    await sendTelegramMessage(chatId, presentation.helpText);
    return { handled: true, duplicate: false };
  }
  if (command === "privacy") {
    await sendTelegramMessage(chatId, privacyReply(config, presentation.privacyText));
    return { handled: true, duplicate: false };
  }
  if (command === "terms") {
    await sendTelegramMessage(chatId, `Terms:\n${publicPageUrl(config, config.termsUrl)}`);
    return { handled: true, duplicate: false };
  }
  if (command === "paysupport") {
    await sendTelegramMessage(chatId, paymentSupportMessage(config));
    return { handled: true, duplicate: false };
  }
  return { handled: false, duplicate: false };
}

export function createTelegramWebhookRoute(config: AppConfig, copy?: TelegramStartCopy) {
  const startCopy = copy ?? defaultTelegramStartCopy(config);
  return {
    POST: async (request: Request) => {
      try {
        verifyTelegramWebhookSecret(request);
      } catch (error) {
        if (error instanceof TelegramAuthError) {
          console.info("[minifactory] telegram_webhook_rejected", { app: config.slug, reason: "secret" });
          return Response.json({ ok: false }, { status: 401 });
        }
        console.info("[minifactory] telegram_webhook_rejected", { app: config.slug, reason: "config" });
        return Response.json({ ok: false }, { status: 503 });
      }
      let update: TelegramUpdate = {};
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return Response.json({ ok: true, ignored: true });
      }
      try {
        const result = await handleTelegramBotUpdate(config, update, startCopy);
        return Response.json({ ok: true, ...result });
      } catch {
        console.info("[minifactory] telegram_webhook_send_failed", { app: config.slug });
        return Response.json({ ok: true, handled: false });
      }
    },
  };
}
