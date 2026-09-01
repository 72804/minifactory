import { describe, expect, it } from "vitest";
import { isStartCommand, parseBotCommand, telegramPublicAssetUrl, webAppInlineKeyboard } from "./telegram-webhook";

describe("isStartCommand", () => {
  it("accepts /start and /start@bot", () => {
    expect(isStartCommand("/start")).toBe(true);
    expect(isStartCommand("/start@LensMiniBot")).toBe(true);
    expect(isStartCommand("/start ref_abc")).toBe(true);
  });

  it("ignores other messages", () => {
    expect(isStartCommand("/help")).toBe(false);
    expect(isStartCommand("hello")).toBe(false);
    expect(isStartCommand(undefined)).toBe(false);
  });
});

describe("parseBotCommand", () => {
  it("reads /help and /privacy with an optional bot suffix", () => {
    expect(parseBotCommand("/help")).toBe("help");
    expect(parseBotCommand("/privacy@LensMiniBot")).toBe("privacy");
    expect(parseBotCommand("hello")).toBeNull();
  });
});

describe("LensMini /start web app markup", () => {
  it("uses an inline_keyboard Web App button, not a reply keyboard", () => {
    const markup = webAppInlineKeyboard("📷 OPEN LENSMINI", "https://lensmini.vercel.app");
    expect(markup).toEqual({
      inline_keyboard: [
        [{ text: "📷 OPEN LENSMINI", web_app: { url: "https://lensmini.vercel.app" } }],
      ],
    });
    expect("keyboard" in markup).toBe(false);
  });
});

describe("telegramPublicAssetUrl", () => {
  it("builds the LensMini hero URL from APP_BASE_URL", () => {
    expect(telegramPublicAssetUrl("https://lensmini.vercel.app/", "/telegram/lensmini-hero.png")).toBe(
      "https://lensmini.vercel.app/telegram/lensmini-hero.png",
    );
  });
});
