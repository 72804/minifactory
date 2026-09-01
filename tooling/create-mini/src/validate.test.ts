import { describe, expect, it } from "vitest";
import { assertAccent, assertAppName, assertCapabilities, assertSafeSlug } from "./validate";

describe("create-mini validation", () => {
  it("rejects uppercase slugs instead of silently lowercasing them", () => {
    expect(() => assertSafeSlug("AuditMini")).toThrow(/lowercase/);
  });

  it("rejects spaces and path traversal", () => {
    expect(() => assertSafeSlug("audit mini")).toThrow(/Invalid slug/);
    expect(() => assertSafeSlug("../etc")).toThrow(/path traversal|Invalid slug/);
  });

  it("rejects empty names and malformed accents", () => {
    expect(() => assertAppName("   ")).toThrow(/empty/);
    expect(() => assertAccent("blue")).toThrow(/hex/);
  });

  it("rejects unknown capabilities", () => {
    expect(() => assertCapabilities(["laser"])).toThrow(/Unknown capability/);
  });

  it("accepts a valid slug", () => {
    expect(assertSafeSlug("auditmini")).toBe("auditmini");
  });
});
