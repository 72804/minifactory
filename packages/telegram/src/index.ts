export type TelegramUser = {
  id: number;
  isBot?: boolean;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
};

export type NormalizedTelegramUser = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
};

export type TelegramThemeKind = "light" | "dark";

export type TelegramTheme = {
  colorScheme: TelegramThemeKind;
  bgColor: string;
  textColor: string;
  hintColor: string;
  linkColor: string;
  buttonColor: string;
  buttonTextColor: string;
  secondaryBgColor: string;
  headerBgColor: string;
  accentTextColor: string;
  sectionBgColor: string;
  subtitleTextColor: string;
  destructiveTextColor: string;
};

export const MOCK_TELEGRAM_USER: NormalizedTelegramUser = {
  telegramId: "100000001",
  username: "minifactory_dev",
  firstName: "Mini",
  lastName: "Factory",
  languageCode: "en",
};

export function normalizeTelegramUser(user: TelegramUser): NormalizedTelegramUser {
  return {
    telegramId: String(user.id),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
  };
}

export function buildReferralStartParam(code: string): string {
  return `ref_${code}`;
}

export function parseReferralStartParam(startParam: string | undefined): string | null {
  if (!startParam) {
    return null;
  }
  const match = /^ref_([A-Za-z0-9_-]{4,64})$/.exec(startParam);
  return match?.[1] ?? null;
}

export function buildMiniAppLink(botUsername: string, startParam?: string): string {
  const base = `https://t.me/${botUsername.replace(/^@/, "")}/app`;
  if (!startParam) {
    return base;
  }
  return `${base}?startapp=${encodeURIComponent(startParam)}`;
}
