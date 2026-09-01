import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@minifactory/config/env";
import {
  analyzeImageStructured,
  buildOpenAIResponsesRequest,
  createAIProvider,
  JSON_OBJECT_INPUT_INSTRUCTION,
  sanitizeOpenAIErrorMessage,
} from "./server";
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
      providerCode: "invalid_api_key",
      providerType: "invalid_request_error",
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

  it("sends json_object analyzeImageStructured requests with JSON in the input array", async () => {
    process.env.OPENAI_API_KEY = "not-a-real-key";
    resetServerEnvCache();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await analyzeImageStructured(
      {
        prompt: "Transcribe the visible text first, then translate that transcription. Do not describe the scene.",
        imageBase64: "abc",
        mimeType: "image/jpeg",
        system: "You extract visible text from a photograph and translate it.",
      },
      schema,
      createAIProvider("openai"),
    );
    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as {
      store: boolean;
      text: { format: { type: string } };
      input: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: string }> }>;
    };
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe("json_object");
    const texts = body.input[0]!.content.filter((part) => part.type === "input_text").map((part) => part.text ?? "").join("\n");
    expect(/\bjson\b/i.test(texts)).toBe(true);
    const image = body.input[0]!.content.find((part) => part.type === "input_image");
    expect(image?.image_url).toBe("data:image/jpeg;base64,abc");
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

  it("captures sanitized OpenAI error code, param, and message", async () => {
    stubOpenAI(400, {
      error: {
        type: "invalid_request_error",
        code: "invalid_json_mode",
        param: "text.format",
        message: "Use JSON in the input. key=sk-secretvaluehere data:image/jpeg;base64,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    await expect(
      analyzeImageStructured(
        { prompt: "x", imageBase64: "abc", mimeType: "image/jpeg" },
        schema,
        createAIProvider("openai"),
      ),
    ).rejects.toMatchObject({
      providerStatus: 400,
      providerType: "invalid_request_error",
      providerCode: "invalid_json_mode",
      providerParam: "text.format",
    });
  });
});

describe("Responses API request shape", () => {
  it("uses input_image with a data URI, store:false, and json_object", () => {
    const body = buildOpenAIResponsesRequest({
      model: "gpt-5.6-luna",
      instructions: "System prompt without the required word in input.",
      json: true,
      content: [
        { type: "input_text", text: "Transcribe the visible text first, then translate that transcription." },
        { type: "input_image", image_url: "data:image/jpeg;base64,abc", detail: "low" },
      ],
    });
    expect(body.store).toBe(false);
    expect(body.text).toEqual({ format: { type: "json_object" } });
    const input = body.input as Array<{ role: string; content: Array<{ type: string; image_url?: string; text?: string }> }>;
    expect(Array.isArray(input)).toBe(true);
    expect(input[0]?.role).toBe("user");
    const types = input[0]!.content.map((part) => part.type);
    expect(types).toContain("input_text");
    expect(types).toContain("input_image");
    const image = input[0]!.content.find((part) => part.type === "input_image");
    expect(image?.image_url?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("puts an explicit JSON instruction on json_object input even when only instructions mention JSON", () => {
    const userText = "Detect the source language automatically. Translate into English (en).";
    expect(/\bjson\b/i.test(userText)).toBe(false);
    const body = buildOpenAIResponsesRequest({
      model: "gpt-5.6-luna",
      instructions: "Return JSON with fields.",
      json: true,
      content: [{ type: "input_text", text: userText }],
    });
    const input = body.input as Array<{ content: Array<{ type: string; text?: string }> }>;
    const inputTexts = input[0]!.content.filter((part) => part.type === "input_text").map((part) => part.text ?? "").join("\n");
    expect(/\bjson\b/i.test(inputTexts)).toBe(true);
    expect(inputTexts).toContain(JSON_OBJECT_INPUT_INSTRUCTION);
  });
});

describe("sanitizeOpenAIErrorMessage", () => {
  it("redacts secrets and long base64-like blobs", () => {
    const safe = sanitizeOpenAIErrorMessage(
      "bad sk-abcdefghijklmnopqrstuvwxyz data:image/png;base64,QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
    );
    expect(safe).not.toMatch(/sk-/);
    expect(safe).toContain("[REDACTED]");
  });
});
