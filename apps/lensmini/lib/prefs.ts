import {
  defaultTargetLanguage,
  filterLanguages,
  getLanguage,
  type SupportedLanguage,
} from "./languages";

const TARGET_KEY = "lensmini.targetLanguage";
const RECENT_KEY = "lensmini.recentTargets";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSavedTargetLanguage(telegramLanguage?: string | null): string {
  return defaultTargetLanguage(readJson<string | null>(TARGET_KEY, null), telegramLanguage);
}

export function saveTargetLanguage(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TARGET_KEY, code);
  const recent = loadRecentTargets().filter((item) => item !== code);
  recent.unshift(code);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6)));
}

export function loadRecentTargets(): string[] {
  const stored = readJson<string[]>(RECENT_KEY, []);
  return stored.filter((code) => Boolean(getLanguage(code)));
}

export function languagesForPicker(query: string, recentCodes: string[]): {
  recent: SupportedLanguage[];
  all: SupportedLanguage[];
} {
  const recent = recentCodes
    .map((code) => getLanguage(code))
    .filter((language): language is SupportedLanguage => Boolean(language));
  return { recent: query ? [] : recent, all: filterLanguages(query) };
}
