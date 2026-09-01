import { describe, expect, it } from "vitest";
import { publicErrorMessage, translationResultSchema } from "./schema";

const valid = {
  sourceLanguage: { code: "tr", name: "Turkish" },
  targetLanguage: { code: "en", name: "English" },
  originalText: "Bugün kapalıyız.",
  translatedText: "We are closed today.",
  blocks: [
    {
      originalText: "Bugün kapalıyız.",
      translatedText: "We are closed today.",
      boundingBox: null,
    },
  ],
  confidence: 0.96,
};

describe("translationResultSchema", () => {
  it("accepts a structured translation payload", () => {
    expect(translationResultSchema.parse(valid)).toMatchObject({
      translatedText: "We are closed today.",
      confidence: 0.96,
      blocks: [{ boundingBox: null }],
    });
  });

  it("rejects a malformed provider response", () => {
    expect(() => translationResultSchema.parse({ translatedText: "nope" })).toThrow();
  });

  it("does not fabricate confidence", () => {
    const parsed = translationResultSchema.parse({ ...valid, confidence: undefined });
    expect(parsed.confidence).toBeNull();
  });
});

describe("publicErrorMessage", () => {
  it("uses simple user-facing copy", () => {
    expect(publicErrorMessage("failed")).toBe("Couldn't translate this. Try again.");
    expect(publicErrorMessage("no_text")).toMatch(/No readable text found/);
    expect(publicErrorMessage("usage_limit")).toBe("You've used your 5 free translations today.");
    expect(publicErrorMessage("payment_required")).toBe("You've used your 5 free translations today.");
  });
});
