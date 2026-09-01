import { getServerEnv, isTelegramMockAllowed } from "@minifactory/config/env";
import { hmacSha256, isProductionEnv, safeEqualHex, safeEqualText } from "@minifactory/config/security";
import {
  MOCK_TELEGRAM_USER,
  type NormalizedTelegramUser,
  type TelegramUser,
  normalizeTelegramUser,
} from "./index";

export type TelegramAuthFailureCode =
  | "missing_init_data"
  | "invalid_hash"
  | "expired_init_data"
  | "missing_user";

export class TelegramAuthError extends Error {
  readonly code: TelegramAuthFailureCode;

  constructor(message: string, code: TelegramAuthFailureCode) {
    super(message);
    this.name = "TelegramAuthError";
    this.code = code;
  }
}

export type ValidatedTelegramSession = {
  user: NormalizedTelegramUser;
  startParam?: string;
  authDate: number;
  mock: boolean;
};

function parseUser(raw: string | undefined): TelegramUser | null {
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  };
  if (typeof parsed.id !== "number" || typeof parsed.first_name !== "string") {
    return null;
  }
  return {
    id: parsed.id,
    firstName: parsed.first_name,
    lastName: parsed.last_name,
    username: parsed.username,
    languageCode: parsed.language_code,
    isPremium: parsed.is_premium,
    photoUrl: parsed.photo_url,
  };
}

export function buildInitDataCheckString(initData: string): { hash: string; checkString: string } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramAuthError("initData is missing hash", "invalid_hash");
  }
  params.delete("hash");
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return { hash, checkString };
}

export function validateInitData(
  initData: string,
  botToken = getServerEnv().TELEGRAM_BOT_TOKEN,
  options?: { maxAgeSeconds?: number; nowSeconds?: number },
): ValidatedTelegramSession {
  if (!initData) {
    throw new TelegramAuthError("Missing Telegram initData", "missing_init_data");
  }
  if (!botToken) {
    throw new TelegramAuthError("TELEGRAM_BOT_TOKEN is not configured", "invalid_hash");
  }

  const { hash, checkString } = buildInitDataCheckString(initData);
  const secretKey = hmacSha256("WebAppData", botToken);
  const computed = hmacSha256(secretKey, checkString);
  if (!safeEqualHex(hash, computed)) {
    throw new TelegramAuthError("Invalid Telegram initData signature", "invalid_hash");
  }

  const params = new URLSearchParams(initData);
  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) {
    throw new TelegramAuthError("Invalid auth_date", "invalid_hash");
  }
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = options?.maxAgeSeconds ?? getServerEnv().TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
  if (authDate > now + 60) {
    throw new TelegramAuthError("Telegram initData auth_date is in the future", "expired_init_data");
  }
  if (now - authDate > maxAge) {
    throw new TelegramAuthError("Telegram initData has expired", "expired_init_data");
  }

  const user = parseUser(params.get("user") ?? undefined);
  if (!user) {
    throw new TelegramAuthError("Telegram initData does not include a user", "missing_user");
  }

  return {
    user: normalizeTelegramUser(user),
    startParam: params.get("start_param") ?? undefined,
    authDate,
    mock: false,
  };
}

export function authenticateTelegramRequest(request: Request): ValidatedTelegramSession {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, ...rest] = header.split(" ");
  const payload = rest.join(" ");

  if (scheme === "tma-mock") {
    if (isProductionEnv() || !isTelegramMockAllowed()) {
      throw new TelegramAuthError("Mock Telegram auth is disabled", "missing_init_data");
    }
    return {
      user: MOCK_TELEGRAM_USER,
      startParam: payload || undefined,
      authDate: Math.floor(Date.now() / 1000),
      mock: true,
    };
  }

  if (scheme !== "tma") {
    throw new TelegramAuthError("Missing Telegram authorization", "missing_init_data");
  }

  return validateInitData(payload);
}

export function verifyTelegramWebhookSecret(request: Request): void {
  const expected = getServerEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    throw new TelegramAuthError("TELEGRAM_WEBHOOK_SECRET is not configured", "invalid_hash");
  }
  const provided =
    request.headers.get("x-telegram-bot-api-secret-token") ??
    request.headers.get("x-telegram-webhook-secret");
  if (!provided) {
    throw new TelegramAuthError("Missing webhook secret", "missing_init_data");
  }
  if (!safeEqualText(provided, expected)) {
    throw new TelegramAuthError("Invalid webhook secret", "invalid_hash");
  }
}

export {
  botFetch,
  getBotCommands,
  getBotDescription,
  getBotName,
  getBotShortDescription,
  getChatMenuButton,
  getTelegramBotProfile,
  getTelegramWebhookInfo,
  sendTelegramMessage,
  sendTelegramPhoto,
  createInvoiceLink,
  answerPreCheckoutQuery,
  refundStarPayment,
  setBotCommands,
  setBotDescription,
  setBotName,
  setBotProfilePhoto,
  setBotShortDescription,
  setMiniAppMenuButton,
  setTelegramMenuButton,
  setTelegramWebhook,
} from "./bot-api";
export type { TelegramBotCommand, TelegramChatMenuButton, TelegramInlineButton, TelegramReplyMarkup } from "./bot-api";
export { resolveTelegramPresentation } from "./presentation";
export type { ResolvedTelegramPresentation } from "./presentation";
export { pngIconToTelegramJpeg, withTempBotProfileJpeg } from "./profile-photo";
export { configureTelegramBot } from "./setup";
export type { TelegramSetupReport } from "./setup";
