import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_OPENAI_VISION_MODEL } from "./index";

describe("AI_MODELS", () => {
  it("defaults vision to gpt-5.6-luna", () => {
    const previous = process.env.OPENAI_VISION_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
    expect(DEFAULT_OPENAI_VISION_MODEL).toBe("gpt-5.6-luna");
    expect(AI_MODELS.vision).toBe("gpt-5.6-luna");
    if (previous === undefined) {
      delete process.env.OPENAI_VISION_MODEL;
    } else {
      process.env.OPENAI_VISION_MODEL = previous;
    }
  });

  it("honors OPENAI_VISION_MODEL", () => {
    const previous = process.env.OPENAI_VISION_MODEL;
    process.env.OPENAI_VISION_MODEL = "gpt-test-override";
    expect(AI_MODELS.vision).toBe("gpt-test-override");
    if (previous === undefined) {
      delete process.env.OPENAI_VISION_MODEL;
    } else {
      process.env.OPENAI_VISION_MODEL = previous;
    }
  });
});
