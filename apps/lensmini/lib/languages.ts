export type SupportedLanguage = {
  code: string;
  name: string;
  speech?: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", speech: "en-US" },
  { code: "tr", name: "Turkish", speech: "tr-TR" },
  { code: "es", name: "Spanish", speech: "es-ES" },
  { code: "fr", name: "French", speech: "fr-FR" },
  { code: "de", name: "German", speech: "de-DE" },
  { code: "it", name: "Italian", speech: "it-IT" },
  { code: "pt", name: "Portuguese", speech: "pt-PT" },
  { code: "ru", name: "Russian", speech: "ru-RU" },
  { code: "uk", name: "Ukrainian", speech: "uk-UA" },
  { code: "ar", name: "Arabic", speech: "ar-SA" },
  { code: "fa", name: "Persian", speech: "fa-IR" },
  { code: "he", name: "Hebrew", speech: "he-IL" },
  { code: "zh-CN", name: "Chinese Simplified", speech: "zh-CN" },
  { code: "zh-TW", name: "Chinese Traditional", speech: "zh-TW" },
  { code: "ja", name: "Japanese", speech: "ja-JP" },
  { code: "ko", name: "Korean", speech: "ko-KR" },
  { code: "hi", name: "Hindi", speech: "hi-IN" },
  { code: "ur", name: "Urdu", speech: "ur-PK" },
  { code: "nl", name: "Dutch", speech: "nl-NL" },
  { code: "pl", name: "Polish", speech: "pl-PL" },
  { code: "el", name: "Greek", speech: "el-GR" },
  { code: "ro", name: "Romanian", speech: "ro-RO" },
  { code: "bg", name: "Bulgarian", speech: "bg-BG" },
  { code: "cs", name: "Czech", speech: "cs-CZ" },
  { code: "hu", name: "Hungarian", speech: "hu-HU" },
  { code: "sv", name: "Swedish", speech: "sv-SE" },
  { code: "no", name: "Norwegian", speech: "nb-NO" },
  { code: "da", name: "Danish", speech: "da-DK" },
  { code: "fi", name: "Finnish", speech: "fi-FI" },
  { code: "id", name: "Indonesian", speech: "id-ID" },
  { code: "ms", name: "Malay", speech: "ms-MY" },
  { code: "th", name: "Thai", speech: "th-TH" },
  { code: "vi", name: "Vietnamese", speech: "vi-VN" },
];

const byCode = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));

export function getLanguage(code: string): SupportedLanguage | undefined {
  return byCode.get(code);
}

export function isSupportedLanguage(code: string): boolean {
  return byCode.has(code);
}

export function languageName(code: string): string {
  return getLanguage(code)?.name ?? code;
}

export function normalizeLanguageCode(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const value = raw.trim().replaceAll("_", "-");
  if (!value) {
    return null;
  }
  if (isSupportedLanguage(value)) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("zh-hant") || lower.startsWith("zh-tw") || lower.startsWith("zh-hk")) {
    return "zh-TW";
  }
  if (lower.startsWith("zh")) {
    return "zh-CN";
  }
  const exact = SUPPORTED_LANGUAGES.find((language) => language.code.toLowerCase() === lower);
  if (exact) {
    return exact.code;
  }
  const base = lower.split("-")[0] ?? "";
  const match = SUPPORTED_LANGUAGES.find((language) => language.code.toLowerCase() === base);
  return match?.code ?? null;
}

export function defaultTargetLanguage(preferred?: string | null, telegramLanguage?: string | null): string {
  return (
    normalizeLanguageCode(preferred) ??
    normalizeLanguageCode(telegramLanguage) ??
    "en"
  );
}

export function filterLanguages(query: string): SupportedLanguage[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return SUPPORTED_LANGUAGES;
  }
  return SUPPORTED_LANGUAGES.filter(
    (language) =>
      language.name.toLowerCase().includes(needle) ||
      language.code.toLowerCase().includes(needle),
  );
}
