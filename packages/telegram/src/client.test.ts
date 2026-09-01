import { describe, expect, it } from "vitest";
import { initDataFromFragment } from "./client";

describe("initDataFromFragment", () => {
  it("reads signed tgWebAppData from the Telegram launch hash", () => {
    const initData = "auth_date=1&hash=abc&user=%7B%22id%22%3A1%7D";
    const hash = `#tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppData=${encodeURIComponent(initData)}`;
    expect(initDataFromFragment(hash)).toBe(initData);
  });

  it("returns empty when the fragment is a normal website hash", () => {
    expect(initDataFromFragment("#section")).toBe("");
  });
});
