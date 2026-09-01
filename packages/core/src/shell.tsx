"use client";

import {
  Component,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { AppConfig } from "@minifactory/config";
import { hasCapability } from "@minifactory/config";
import { track } from "@minifactory/analytics/client";
import {
  buildMiniAppLink,
  buildReferralStartParam,
} from "@minifactory/telegram";
import {
  applySafeAreaVars,
  describeTelegramClientAuth,
  getTelegramWebApp,
  hapticNotification,
  initTelegramApp,
  openTelegramLink,
  subscribeToViewport,
  telegramAuthHeaders,
  waitForTelegramInitData,
} from "@minifactory/telegram/client";
import {
  Button,
  ErrorState,
  PageHeader,
  Spinner,
  UpgradeSheet,
  UsageBadge,
} from "@minifactory/ui";
import type { MiniSession } from "./session";
import type { UsageDecision } from "./usage";

type SessionContextValue = {
  session: MiniSession;
  setUsage: (usage: UsageDecision) => void;
};

const MiniSessionContext = createContext<SessionContextValue | null>(null);

export function useMiniSession(): SessionContextValue {
  const value = useContext(MiniSessionContext);
  if (!value) {
    throw new Error("useMiniSession must be used inside AppShell");
  }
  return value;
}

type ShellProps = {
  config: AppConfig;
  children: ReactNode;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; session: MiniSession }
  | { status: "telegram-required" }
  | { status: "error"; message: string };

function authHeader(): HeadersInit {
  return telegramAuthHeaders();
}

export async function factoryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const auth = authHeader();
  if ("authorization" in auth) {
    headers.set("authorization", auth.authorization as string);
  }
  if (!headers.has("content-type") && init?.body) {
    headers.set("content-type", "application/json");
  }
  return fetch(input, { ...init, headers });
}

class MiniErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  override render() {
    if (this.state.error) {
      return <ErrorState title="Something went wrong" body={this.state.error} />;
    }
    return this.props.children;
  }
}

export function AppShell({ config, children }: ShellProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [paywall, setPaywall] = useState(false);
  const [usageOverride, setUsageOverride] = useState<UsageDecision | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--mf-accent", config.theme.accent);
    root.style.setProperty("--mf-radius", config.theme.radius);
    root.style.setProperty("--mf-font", config.theme.fontFamily);
    applySafeAreaVars();
    initTelegramApp();
    const stop = subscribeToViewport(() => undefined);
    return stop;
  }, [config.theme]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        initTelegramApp();
        const initData = await waitForTelegramInitData();
        const mockAllowed =
          process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_TELEGRAM_MOCK === "true";
        if (!initData && !mockAllowed) {
          if (!cancelled) {
            setState({ status: "telegram-required" });
          }
          return;
        }
        console.info("[minifactory] telegram_boot", describeTelegramClientAuth());
        const response = await factoryFetch("/api/mf/session", { method: "POST" });
        if (!response.ok) {
          throw new Error("Could not start Mini App session");
        }
        const session = (await response.json()) as MiniSession;
        if (!cancelled) {
          setState({ status: "ready", session });
        }
      } catch (error) {
        const initData = getTelegramWebApp()?.initData?.trim();
        if (!initData && process.env.NODE_ENV === "production") {
          if (!cancelled) {
            setState({ status: "telegram-required" });
          }
          return;
        }
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Failed to load",
          });
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const shareUrl = useMemo(() => {
    if (state.status !== "ready") {
      return buildMiniAppLink(config.botUsername);
    }
    return buildMiniAppLink(
      config.botUsername,
      hasCapability(config, "referrals")
        ? buildReferralStartParam(state.session.user.id)
        : undefined,
    );
  }, [config.botUsername, state]);

  if (state.status === "loading") {
    return (
      <div className="mf-shell" data-app={config.id}>
        <div className="mf-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (state.status === "telegram-required") {
    const bot = config.botUsername.replace(/^@/, "");
    return (
      <div className="mf-shell" data-app={config.id}>
        <div className="mf-center lm-cta" style={{ gap: 12, padding: 24, textAlign: "center" }}>
          {config.logo ? (
            <img src={config.logo} alt="" width={64} height={64} className="lm-logo-lg" />
          ) : null}
          <strong>{config.name} works inside Telegram</strong>
          <p style={{ color: "var(--mf-muted)", margin: 0 }}>
            {config.slug === "lensmini"
              ? `Open LensMini from @${bot} to start translating.`
              : `Open ${config.name} from @${bot}.`}
          </p>
          <Button
            onClick={() => {
              openTelegramLink(buildMiniAppLink(bot));
            }}
          >
            Open in Telegram
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mf-shell" data-app={config.id}>
        <ErrorState title="Unable to load" body={state.message} />
      </div>
    );
  }

  const session = usageOverride
    ? { ...state.session, usage: usageOverride }
    : state.session;
  const inTelegram = Boolean(getTelegramWebApp()?.initData);
  const canShare = config.shell.showShare;
  const canPaywall = Boolean(config.shell.showPaywall && config.monetization.enabled);
  const showMockNotice =
    !inTelegram &&
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_TELEGRAM_MOCK === "true";
  const shellClass = config.shell.immersive ? "mf-shell mf-shell-immersive" : "mf-shell";
  const headerDescription = config.listing.tagline ?? config.description;

  return (
    <MiniErrorBoundary>
      <MiniSessionContext.Provider value={{ session, setUsage: setUsageOverride }}>
      <div className={shellClass} data-app={config.id}>
        {config.shell.showHeader !== false ? (
        <PageHeader
          title={config.name}
          description={headerDescription}
          action={
            <div className="mf-row">
              {config.shell.showUsage ? (
                <UsageBadge
                  remaining={session.usage.remaining}
                  limit={session.usage.limit}
                  noun={config.limits.features.translate ? "free translations" : "free"}
                />
              ) : null}
              {canShare ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (config.analytics.enabled) {
                      void track("share_clicked");
                    }
                    hapticNotification("success");
                    openTelegramLink(shareUrl);
                  }}
                >
                  Share
                </Button>
              ) : null}
            </div>
          }
        />
        ) : null}
        {showMockNotice ? (
          <p style={{ color: "var(--mf-muted)", marginTop: 0 }}>
            Telegram mock session is active for local development.
          </p>
        ) : null}
        {children}
        {canPaywall ? (
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setPaywall(true)}>
              Usage & upgrades
            </Button>
          </div>
        ) : null}
        <UpgradeSheet
          open={paywall}
          remaining={
            Number.isFinite(session.usage.remaining) ? session.usage.remaining : 999
          }
          onClose={() => setPaywall(false)}
        />
      </div>
      </MiniSessionContext.Provider>
    </MiniErrorBoundary>
  );
}

export { MiniErrorBoundary };
export type { MiniSession };
