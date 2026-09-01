export type TelegramWebAppButton = {
  show: (text?: string) => void;
  hide: () => void;
  setText: (text: string) => void;
  onClick: (handler: () => void) => () => void;
  enable: () => void;
  disable: () => void;
};

type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
};

type TelegramMainButton = {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  show: () => void;
  hide: () => void;
  setText: (text: string) => void;
  onClick: (fn: () => void) => void;
  offClick: (fn: () => void) => void;
  enable: () => void;
  disable: () => void;
};

type TelegramBackButton = {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (fn: () => void) => void;
  offClick: (fn: () => void) => void;
};

type TelegramHaptic = {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    start_param?: string;
    auth_date?: number;
  };
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  MainButton: TelegramMainButton;
  BackButton: TelegramBackButton;
  HapticFeedback: TelegramHaptic;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramApp(): TelegramWebApp | null {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return null;
  }
  webApp.ready();
  webApp.expand();
  applyTelegramThemeVars(webApp);
  applySafeAreaVars();
  return webApp;
}

export function getInitDataRaw(): string {
  return getTelegramWebApp()?.initData ?? "";
}

export function getStartParam(): string | undefined {
  return getTelegramWebApp()?.initDataUnsafe.start_param;
}

export function telegramAuthHeaders(): HeadersInit {
  const initData = getInitDataRaw();
  if (initData) {
    return { authorization: `tma ${initData}` };
  }
  const allowMock =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_TELEGRAM_MOCK === "true";
  if (allowMock) {
    return { authorization: `tma-mock ${getStartParam() ?? ""}` };
  }
  return {};
}

export function closeMiniApp(): void {
  getTelegramWebApp()?.close();
}

export function openTelegramLink(url: string): void {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.openTelegramLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  getTelegramWebApp()?.HapticFeedback.impactOccurred(style);
}

export function hapticNotification(type: "error" | "success" | "warning"): void {
  getTelegramWebApp()?.HapticFeedback.notificationOccurred(type);
}

export function createMainButton(): TelegramWebAppButton {
  const bind = () => getTelegramWebApp()?.MainButton;
  return {
    show: (text) => {
      const button = bind();
      if (!button) return;
      if (text) button.setText(text);
      button.show();
    },
    hide: () => bind()?.hide(),
    setText: (text) => bind()?.setText(text),
    onClick: (handler) => {
      const button = bind();
      if (!button) return () => undefined;
      button.onClick(handler);
      return () => button.offClick(handler);
    },
    enable: () => bind()?.enable(),
    disable: () => bind()?.disable(),
  };
}

export function createBackButton(): Omit<TelegramWebAppButton, "setText" | "enable" | "disable"> {
  const bind = () => getTelegramWebApp()?.BackButton;
  return {
    show: () => bind()?.show(),
    hide: () => bind()?.hide(),
    onClick: (handler) => {
      const button = bind();
      if (!button) return () => undefined;
      button.onClick(handler);
      return () => button.offClick(handler);
    },
  };
}

export function applyTelegramThemeVars(webApp?: TelegramWebApp | null): void {
  const app = webApp ?? getTelegramWebApp();
  if (!app || typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const params = app.themeParams;
  root.dataset.tgTheme = app.colorScheme;
  const assign = (name: string, value: string | undefined, fallback: string) => {
    root.style.setProperty(name, value || fallback);
  };
  assign("--tg-theme-bg-color", params.bg_color, app.colorScheme === "dark" ? "#111111" : "#ffffff");
  assign("--tg-theme-text-color", params.text_color, app.colorScheme === "dark" ? "#ffffff" : "#111111");
  assign("--tg-theme-hint-color", params.hint_color, "#888888");
  assign("--tg-theme-link-color", params.link_color, "#2481cc");
  assign("--tg-theme-button-color", params.button_color, "#2481cc");
  assign("--tg-theme-button-text-color", params.button_text_color, "#ffffff");
  assign(
    "--tg-theme-secondary-bg-color",
    params.secondary_bg_color,
    app.colorScheme === "dark" ? "#1c1c1d" : "#f1f1f1",
  );
  assign("--tg-theme-header-bg-color", params.header_bg_color, params.bg_color || "#ffffff");
  assign("--tg-theme-accent-text-color", params.accent_text_color, params.button_color || "#2481cc");
  assign(
    "--tg-viewport-height",
    `${app.viewportStableHeight || app.viewportHeight || window.innerHeight}px`,
    "100dvh",
  );
}

export function applySafeAreaVars(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--mf-safe-top", "env(safe-area-inset-top, 0px)");
  root.style.setProperty("--mf-safe-bottom", "env(safe-area-inset-bottom, 0px)");
  root.style.setProperty("--mf-safe-left", "env(safe-area-inset-left, 0px)");
  root.style.setProperty("--mf-safe-right", "env(safe-area-inset-right, 0px)");
}

export function subscribeToViewport(handler: () => void): () => void {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return () => undefined;
  }
  const wrapped = () => {
    applyTelegramThemeVars(webApp);
    handler();
  };
  webApp.onEvent("viewportChanged", wrapped);
  webApp.onEvent("themeChanged", wrapped);
  return () => {
    webApp.offEvent("viewportChanged", wrapped);
    webApp.offEvent("themeChanged", wrapped);
  };
}
