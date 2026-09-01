import { describe, expect, it } from "vitest";
import { quotaLabel } from "./quota-label";

describe("quotaLabel", () => {
  it("shows remaining free translations", () => {
    expect(
      quotaLabel({ remaining: 4, limit: 5, freeRemaining: 4, freeLimit: 5, credits: 0, proActive: false }),
    ).toBe("4 / 5 free");
  });

  it("shows purchased credits instead of 0 / 5 free", () => {
    expect(
      quotaLabel({ remaining: 18, limit: 5, freeRemaining: 0, freeLimit: 5, credits: 18, proActive: false }),
    ).toBe("18 credits");
  });

  it("shows Pro remaining for the UTC day", () => {
    expect(
      quotaLabel({
        remaining: 94,
        limit: 100,
        freeRemaining: 0,
        freeLimit: 5,
        credits: 0,
        proActive: true,
        proRemainingToday: 94,
      }),
    ).toBe("PRO · 94 left today");
  });
});
