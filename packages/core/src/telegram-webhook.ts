import type { AppConfig } from "@minifactory/config";
import { getServerEnv } from "@minifactory/config/env";
import {
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "@minifactory/notifications";
import { TelegramAuthError } from "@minifactory/telegram/server";

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
  const tagline = config.listing.tagline ?? config.description;
  return {
    text: `${config.name}\n\n${tagline}\n\nOpen the Mini App below.`,
    buttonText: `Open ${config.name}`,
  };
}

export function miniAppUrl(): string {
  return getServerEnv().APP_BASE_URL.replace(/\/$/, "");
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number };
  };
};

export function isStartCommand(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text.trim());
}

export function webAppInlineKeyboard(buttonText: string, url: string) {
  return {
    inline_keyboard: [[{ text: buttonText, web_app: { url } }]],
  };
}

export async function handleTelegramBotUpdate(
  config: AppConfig,
  update: TelegramUpdate,
  copy: TelegramStartCopy = defaultTelegramStartCopy(config),
): Promise<{ handled: boolean; duplicate: boolean }> {
  const updateId = update.update_id;
  if (typeof updateId === "number" && !rememberUpdate(updateId)) {
    return { handled: false, duplicate: true };
  }
  const text = update.message?.text;
  const chatId = update.message?.chat?.id;
  if (!isStartCommand(text) || typeof chatId !== "number") {
    return { handled: false, duplicate: false };
  }
  const url = miniAppUrl();
  await sendTelegramMessage(chatId, copy.text, {
    replyMarkup: webAppInlineKeyboard(copy.buttonText, url),
  });
  console.info("[minifactory] telegram_start", { app: config.slug, hasChat: true });
  return { handled: true, duplicate: false };
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
