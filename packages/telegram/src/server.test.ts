import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resetServerEnvCache } from "@minifactory/config/env";
import { authenticateTelegramRequest, buildInitDataCheckString, validateInitData } from "./server";

function signInitData(botToken: string, fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const TOKEN = "123456:TEST_TOKEN";
const user = JSON.stringify({ id: 42, first_name: "Ada" });
const SIGNATURE = "third-party-ed25519-placeholder";

describe("validateInitData", () => {
  it("rejects empty initData", () => {
    expect(() => validateInitData("", TOKEN)).toThrow(/Missing Telegram initData/);
    expect(() =>
      authenticateTelegramRequest(new Request("https://example.com", { method: "POST" })),
    ).toThrow(/Missing Telegram authorization/);
  });

  it("accepts valid initData without a signature field", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user,
    });
    const { checkString } = buildInitDataCheckString(initData);
    expect(checkString.includes("signature=")).toBe(false);
    const session = validateInitData(initData, TOKEN);
    expect(session.user.telegramId).toBe("42");
    expect(session.mock).toBe(false);
  });

  it("accepts valid initData with signature included in the HMAC data-check-string", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      signature: SIGNATURE,
      user,
    });
    const { checkString } = buildInitDataCheckString(initData);
    expect(checkString).toContain(`signature=${SIGNATURE}`);
    const session = validateInitData(initData, TOKEN);
    expect(session.user.telegramId).toBe("42");
  });

  it("rejects a tampered signature field", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      signature: SIGNATURE,
      user,
    });
    const tampered = initData.replace(encodeURIComponent(SIGNATURE), encodeURIComponent(`${SIGNATURE}-tampered`));
    expect(() => validateInitData(tampered, TOKEN)).toThrow(/Invalid Telegram initData signature/);
  });

  it("rejects a tampered user object even if the client sends one", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      signature: SIGNATURE,
      user,
    });
    const tampered = initData.replace("Ada", "Eve");
    expect(() => validateInitData(tampered, TOKEN)).toThrow(/Invalid Telegram initData signature/);
  });

  it("rejects stale initData using configurable max age", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000) - 120),
      signature: SIGNATURE,
      user,
    });
    expect(() => validateInitData(initData, TOKEN, { maxAgeSeconds: 60 })).toThrow(/expired/);
  });

  it("rejects an invalid hash", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
      signature: SIGNATURE,
      user,
    });
    const tampered = initData.replace(/hash=[0-9a-f]+/, "hash=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    expect(() => validateInitData(tampered, TOKEN)).toThrow(/Invalid Telegram initData signature/);
  });

  it("rejects a valid hash that does not include a user", () => {
    const initData = signInitData(TOKEN, {
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    expect(() => validateInitData(initData, TOKEN)).toThrow(/does not include a user/);
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
