import { describe, expect, it } from "vitest";
import { isStartCommand } from "./telegram-webhook";

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
