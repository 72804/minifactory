import { getServerEnv } from "@minifactory/config/env";
import { verifyTelegramWebhookSecret } from "@minifactory/telegram/server";

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramInlineButton = {
  text: string;
  url?: string;
  web_app?: { url: string };
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineButton[][];
};

async function botFetch<T = { ok: boolean; result?: unknown; description?: string }>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getServerEnv().TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for Bot API calls");
  }
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await response.json()) as T & { ok?: boolean; description?: string };
  if (!response.ok || json.ok === false) {
    throw new Error(`Telegram Bot API ${method} failed: ${response.status}`);
  }
  return json;
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: { replyMarkup?: TelegramReplyMarkup },
) {
  return botFetch("sendMessage", {
    chat_id: chatId,
    text,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
}

export async function setTelegramWebhook(url: string, secretToken?: string) {
  return botFetch("setWebhook", {
    url,
    secret_token: secretToken ?? getServerEnv().TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

export async function getTelegramWebhookInfo() {
  return botFetch<{
    ok: boolean;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
      last_error_date?: number;
    };
  }>("getWebhookInfo");
}

export async function getTelegramBotProfile() {
  return botFetch<{ ok: boolean; result?: { id?: number; username?: string; first_name?: string } }>("getMe");
}

export async function setTelegramMenuButton(webAppUrl: string, text = "Open") {
  return botFetch("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text,
      web_app: { url: webAppUrl },
    },
  });
}

export { verifyTelegramWebhookSecret };
