import { getServerEnv } from "@minifactory/config/env";

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramInlineButton = {
  text: string;
  url?: string;
  web_app?: { url: string };
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineButton[][];
};

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export type TelegramChatMenuButton =
  | { type: "default" | "commands" }
  | { type: "web_app"; text?: string; web_app?: { url?: string } };

type BotApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

function token(): string {
  const value = getServerEnv().TELEGRAM_BOT_TOKEN;
  if (!value) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for Bot API calls");
  }
  return value;
}

function fail(method: string, status: number, description?: string): never {
  const detail = description ? `: ${description}` : "";
  throw new Error(`Telegram Bot API ${method} failed (${status})${detail}`);
}

export async function botFetch<T = unknown>(
  method: string,
  body?: Record<string, unknown> | FormData,
): Promise<T> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        };
  const response = await fetch(`${TELEGRAM_API}/bot${token()}/${method}`, init);
  const json = (await response.json()) as BotApiResponse<T>;
  if (!response.ok || json.ok === false) {
    fail(method, response.status, json.description);
  }
  return (json.result as T) ?? (json as T);
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
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    last_error_date?: number;
  }>("getWebhookInfo");
}

export async function getTelegramBotProfile() {
  return botFetch<{ id?: number; username?: string; first_name?: string }>("getMe");
}

export async function setBotName(name: string) {
  return botFetch("setMyName", { name });
}

export async function getBotName() {
  return botFetch<{ name?: string }>("getMyName");
}

export async function setBotDescription(description: string) {
  return botFetch("setMyDescription", { description });
}

export async function getBotDescription() {
  return botFetch<{ description?: string }>("getMyDescription");
}

export async function setBotShortDescription(short_description: string) {
  return botFetch("setMyShortDescription", { short_description });
}

export async function getBotShortDescription() {
  return botFetch<{ short_description?: string }>("getMyShortDescription");
}

export async function setBotCommands(commands: TelegramBotCommand[]) {
  return botFetch("setMyCommands", { commands });
}

export async function getBotCommands() {
  return botFetch<TelegramBotCommand[]>("getMyCommands");
}

export async function setMiniAppMenuButton(webAppUrl: string, text = "Open") {
  return botFetch("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text,
      web_app: { url: webAppUrl },
    },
  });
}

export async function getChatMenuButton() {
  return botFetch<TelegramChatMenuButton>("getChatMenuButton");
}

export const setTelegramMenuButton = setMiniAppMenuButton;

export async function setBotProfilePhoto(jpeg: Buffer) {
  const form = new FormData();
  form.set("photo", JSON.stringify({ type: "static", photo: "attach://profile.jpg" }));
  form.set("profile.jpg", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "profile.jpg");
  return botFetch("setMyProfilePhoto", form);
}
