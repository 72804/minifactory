import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resetServerEnvCache } from "@minifactory/config/env";
import { authenticateTelegramRequest, validateInitData } from "./server";

function signInitData(botToken: string, fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const TOKEN = "123456:TEST_TOKEN";
const user = JSON.stringify({ id: 42, first_name: "Ada" });

describe("validateInitData", () => {
  it("accepts a correctly signed payload", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user,
    });
    const session = validateInitData(initData, TOKEN);
    expect(session.user.telegramId).toBe("42");
    expect(session.mock).toBe(false);
  });

  it("rejects a tampered user object even if the client sends one", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user,
    });
    const tampered = initData.replace("Ada", "Eve");
    expect(() => validateInitData(tampered, TOKEN)).toThrow(/Invalid Telegram initData signature/);
  });

  it("rejects stale initData using configurable max age", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000) - 120),
      user,
    });
    expect(() => validateInitData(initData, TOKEN, { maxAgeSeconds: 60 })).toThrow(/expired/);
  });

  it("uses the provided bot token, not a global default baked into the client", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user,
    });
    expect(() => validateInitData(initData, "other-bot-token")).toThrow(/Invalid Telegram initData signature/);
  });
});

describe("authenticateTelegramRequest mock gate", () => {
  it("rejects tma-mock in production even if ALLOW_TELEGRAM_MOCK and NEXT_PUBLIC_TELEGRAM_MOCK are true", () => {
    const previous = { ...process.env };
    process.env.NODE_ENV = "production";
    process.env.ALLOW_TELEGRAM_MOCK = "true";
    process.env.NEXT_PUBLIC_TELEGRAM_MOCK = "true";
    resetServerEnvCache();
    try {
      expect(() =>
        authenticateTelegramRequest(new Request("https://example.com", { headers: { authorization: "tma-mock" } })),
      ).toThrow(/Mock Telegram auth is disabled/);
    } finally {
      process.env.NODE_ENV = previous.NODE_ENV;
      process.env.ALLOW_TELEGRAM_MOCK = previous.ALLOW_TELEGRAM_MOCK;
      process.env.NEXT_PUBLIC_TELEGRAM_MOCK = previous.NEXT_PUBLIC_TELEGRAM_MOCK;
      resetServerEnvCache();
    }
  });
});
