import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@minifactory/config/env";
import { analyzeImageStructured, createAIProvider } from "./server";
import { z } from "zod";

const schema = z.object({ ok: z.boolean() });

function stubOpenAI(status: number, body: unknown): void {
  process.env.OPENAI_API_KEY = "not-a-real-key";
  resetServerEnvCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("openaiResponses error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetServerEnvCache();
  });

  it("classifies HTTP 401 invalid_api_key", async () => {
    stubOpenAI(401, { error: { type: "invalid_request_error", code: "invalid_api_key" } });
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({
      name: "AIProviderError",
      category: "invalid_openai_key",
      providerStatus: 401,
    });
  });

  it("classifies HTTP 429", async () => {
    stubOpenAI(429, { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } });
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({ category: "provider_429", providerStatus: 429 });
  });

  it("classifies HTTP 500", async () => {
    stubOpenAI(500, { error: { type: "server_error" } });
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({ category: "provider_5xx", providerStatus: 500 });
  });

  it("classifies abort/timeout", async () => {
    process.env.OPENAI_API_KEY = "not-a-real-key";
    resetServerEnvCache();
    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    }));
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({ category: "timeout" });
  });

  it("classifies structured-output integration failure", async () => {
    stubOpenAI(200, { output_text: "not-json" });
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({ category: "malformed_structured_output" });
  });
});
