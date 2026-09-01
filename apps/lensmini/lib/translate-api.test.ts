import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetServerEnvCache } from "@minifactory/config/env";
import { isExampleDatabaseUrl } from "@minifactory/config/security";
import { prisma } from "@minifactory/db";
import { consumeUsage, UsageLimitError } from "@minifactory/core/server";
import { defineAppConfig } from "@minifactory/config";
import { AIProviderError, type AIProvider } from "@minifactory/ai";
import { appConfig, TRANSLATE_FEATURE } from "../app.config";
import { handleTranslateRequest } from "./translate-api";
import { listHistory, persistTranslation } from "./history";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), "../../.env"));
loadEnvFile(resolve(process.cwd(), "../../.env.local"));

const TOKEN = "123456:LENSMINI_TEST_TOKEN";
const JPEG_1X1 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const GIF =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function signInitData(botToken: string, fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function authHeaders(telegramId: number, firstName = "Ada"): HeadersInit {
  const initData = signInitData(TOKEN, {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: firstName, language_code: "en" }),
  });
  return { authorization: `tma ${initData}`, "content-type": "application/json" };
}

function dbReady(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !isExampleDatabaseUrl(url));
}

const visionOk = {
  sourceLanguage: { code: "tr", name: "Turkish" },
  targetLanguage: { code: "en", name: "English" },
  originalText: "Merhaba dünya",
  translatedText: "Hello world",
  blocks: [{ originalText: "Merhaba dünya", translatedText: "Hello world", boundingBox: null }],
  confidence: null,
  noText: false,
  unreadable: false,
};

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  const base: AIProvider = {
    id: "test",
    generateText: async () => "",
    generateStructured: async (_input, schema) => schema.parse(visionOk),
    analyzeImage: async () => JSON.stringify(visionOk),
    analyzeImageStructured: async (_input, schema) => schema.parse(visionOk),
    transcribeAudio: async () => "",
  };
  return { ...base, ...overrides };
}

async function translate(body: unknown, telegramId = Math.floor(Math.random() * 1_000_000_000) + 2_000_000, ai?: AIProvider) {
  return handleTranslateRequest(
    new Request("http://localhost/api/translate", {
      method: "POST",
      headers: authHeaders(telegramId),
      body: JSON.stringify(body),
    }),
    { provider: ai ?? provider() },
  );
}

describe.skipIf(!dbReady())("POST /api/translate", { timeout: 30_000 }, () => {
  beforeAll(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.ALLOW_TELEGRAM_MOCK = "true";
    resetServerEnvCache();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects missing Telegram identity", async () => {
    const response = await handleTranslateRequest(
      new Request("http://localhost/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" }),
      }),
      { provider: provider() },
    );
    expect(response.status).toBe(401);
  });

  it("accepts tma-mock only when mock is allowed (non-production)", async () => {
    const response = await handleTranslateRequest(
      new Request("http://localhost/api/translate", {
        method: "POST",
        headers: { authorization: "tma-mock", "content-type": "application/json" },
        body: JSON.stringify({
          targetLanguage: "en",
          imageBase64: JPEG_1X1,
          mimeType: "image/jpeg",
        }),
      }),
      { provider: provider() },
    );
    expect(response.status).not.toBe(401);
  });

  it("rejects invalid MIME before calling the provider", async () => {
    let called = false;
    const response = await translate(
      { targetLanguage: "en", imageBase64: GIF, mimeType: "image/gif" },
      undefined,
      provider({
        analyzeImageStructured: async (_input, schema) => {
          called = true;
          return schema.parse(visionOk);
        },
      }),
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { code: string };
    expect(json.code).toBe("unsupported_type");
    expect(called).toBe(false);
  });

  it("rejects oversized payloads", async () => {
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 40, 1);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const response = await translate({
      targetLanguage: "en",
      imageBase64: bytes.toString("base64"),
      mimeType: "image/jpeg",
    });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { code: string };
    expect(json.code).toBe("too_large");
  });

  it("rejects a missing target language", async () => {
    const response = await translate({ imageBase64: JPEG_1X1, mimeType: "image/jpeg" });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { code: string };
    expect(json.code).toBe("missing_target");
  });

  it("rejects an unsupported language", async () => {
    const response = await translate({
      targetLanguage: "xx",
      imageBase64: JPEG_1X1,
      mimeType: "image/jpeg",
    });
    expect(response.status).toBe(400);
    const json = (await response.json()) as { code: string };
    expect(json.code).toBe("unsupported_language");
  });

  it("returns a structured translation", async () => {
    const response = await translate({
      targetLanguage: "en",
      imageBase64: JPEG_1X1,
      mimeType: "image/jpeg",
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { translatedText: string; blocks: unknown[] };
    expect(json.translatedText).toBe("Hello world");
    expect(json.blocks.length).toBeGreaterThan(0);
  });

  it("allows 5 translations and rejects the 6th", async () => {
    const telegramId = Math.floor(Math.random() * 1_000_000_000) + 3_000_000;
    for (let i = 0; i < 5; i += 1) {
      const response = await translate(
        { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
        telegramId,
      );
      expect(response.status).toBe(200);
    }
    const sixth = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
    );
    expect(sixth.status).toBe(429);
    const json = (await sixth.json()) as { code: string };
    expect(json.code).toBe("usage_limit");
  });

  it("does not consume quota when the image is rejected before the provider", async () => {
    const telegramId = Math.floor(Math.random() * 1_000_000_000) + 4_000_000;
    const bad = await translate(
      { targetLanguage: "en", imageBase64: GIF, mimeType: "image/gif" },
      telegramId,
    );
    expect(bad.status).toBe(400);
    for (let i = 0; i < 5; i += 1) {
      const response = await translate(
        { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
        telegramId,
      );
      expect(response.status).toBe(200);
    }
    const sixth = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
    );
    expect(sixth.status).toBe(429);
  });

  it("consumes quota for a successful no-text provider result", async () => {
    const telegramId = Math.floor(Math.random() * 1_000_000_000) + 5_000_000;
    const noText = {
      ...visionOk,
      originalText: "",
      translatedText: "",
      blocks: [],
      noText: true,
    };
    const response = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
      provider({
        analyzeImageStructured: async (_input, schema) => schema.parse(noText),
      }),
    );
    expect(response.status).toBe(422);
    const json = (await response.json()) as { code: string; usage: { remaining: number } };
    expect(json.code).toBe("no_text");
    expect(json.usage.remaining).toBe(4);
  });

  it("refunds quota on OpenAI 401/429/500/timeout and malformed structured output", { timeout: 60_000 }, async () => {
    const telegramId = Math.floor(Math.random() * 1_000_000_000) + 6_000_000;
    const failures: AIProviderError[] = [
      new AIProviderError("401", { category: "invalid_openai_key", providerStatus: 401 }),
      new AIProviderError("429", { category: "provider_429", providerStatus: 429 }),
      new AIProviderError("500", { category: "provider_5xx", providerStatus: 500 }),
      new AIProviderError("timeout", { category: "timeout" }),
    ];
    for (const failure of failures) {
      const response = await translate(
        { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
        telegramId,
        provider({
          analyzeImageStructured: async () => {
            throw failure;
          },
        }),
      );
      expect(response.status).toBe(502);
    }
    const schemaFail = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
      provider({
        analyzeImageStructured: async () => ({ nope: true }) as never,
      }),
    );
    expect(schemaFail.status).toBe(502);
    for (let i = 0; i < 5; i += 1) {
      const response = await translate(
        { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
        telegramId,
      );
      expect(response.status).toBe(200);
    }
    const sixth = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
    );
    expect(sixth.status).toBe(429);
  });

  it("keeps the last concurrent credit safe", async () => {
    const telegramId = Math.floor(Math.random() * 1_000_000_000) + 7_000_000;
    for (let i = 0; i < 4; i += 1) {
      const response = await translate(
        { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
        telegramId,
      );
      expect(response.status).toBe(200);
    }
    const racing = await Promise.all([
      translate({ targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" }, telegramId),
      translate({ targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" }, telegramId),
    ]);
    const statuses = racing.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 429]);
    const leftover = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      telegramId,
    );
    expect(leftover.status).toBe(429);
  });

  it("returns a safe public error when the provider fails", async () => {
    const response = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      undefined,
      provider({
        analyzeImageStructured: async () => {
          throw new AIProviderError("secret stack");
        },
      }),
    );
    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe("Couldn't translate this. Try again.");
    expect(JSON.stringify(json)).not.toMatch(/secret stack/);
  });

  it("rejects a malformed provider payload without leaking internals", async () => {
    const response = await translate(
      { targetLanguage: "en", imageBase64: JPEG_1X1, mimeType: "image/jpeg" },
      undefined,
      provider({
        analyzeImageStructured: async () => ({ nope: true }) as never,
      }),
    );
    expect(response.status).toBe(502);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe("Couldn't translate this. Try again.");
  });
});

describe.skipIf(!dbReady())("usage isolation", { timeout: 30_000 }, () => {
  it("LensMini usage does not consume demo/template process quota", async () => {
    const user = await prisma.user.create({
      data: { telegramId: `iso-${Date.now()}`, firstName: "Iso" },
    });
    const lens = await prisma.app.upsert({
      where: { slug: "lensmini" },
      update: { name: "LensMini" },
      create: { slug: "lensmini", name: "LensMini" },
    });
    const demo = await prisma.app.upsert({
      where: { slug: "demo" },
      update: {},
      create: { slug: "demo", name: "Demo Mini" },
    });
    const demoConfig = defineAppConfig({
      id: "demo",
      name: "Demo Mini",
      slug: "demo",
      description: "audit",
      botUsername: "AuditBot",
      productionUrl: "",
      theme: { accent: "#0ea5e9", radius: "16px", fontFamily: "system-ui" },
      listing: { shortDescription: "audit", longDescription: "audit", category: "utilities", keywords: [] },
      capabilities: ["telegramAuth", "database"],
      limits: {
        anonymousUsage: false,
        features: { process: { freePerDay: 5, extraAfterAd: 0, premiumUnlimited: false, unlimited: false } },
      },
    });

    for (let i = 0; i < 5; i += 1) {
      await consumeUsage({
        config: appConfig,
        appId: lens.id,
        userId: user.id,
        feature: TRANSLATE_FEATURE,
      });
    }
    await expect(
      consumeUsage({
        config: appConfig,
        appId: lens.id,
        userId: user.id,
        feature: TRANSLATE_FEATURE,
      }),
    ).rejects.toBeInstanceOf(UsageLimitError);

    const demoUsage = await consumeUsage({
      config: demoConfig,
      appId: demo.id,
      userId: user.id,
      feature: "process",
    });
    expect(demoUsage.allowed).toBe(true);
    expect(demoUsage.remaining).toBe(4);
  });
});

describe.skipIf(!dbReady())("history isolation", { timeout: 30_000 }, () => {
  it("returns only the current LensMini user's entries", async () => {
    const app = await prisma.app.upsert({
      where: { slug: "lensmini" },
      update: { name: "LensMini" },
      create: { slug: "lensmini", name: "LensMini" },
    });
    const userA = await prisma.user.create({
      data: { telegramId: `hist-a-${Date.now()}`, firstName: "A" },
    });
    const userB = await prisma.user.create({
      data: { telegramId: `hist-b-${Date.now()}`, firstName: "B" },
    });
    await persistTranslation({
      appId: app.id,
      userId: userA.id,
      sourceLanguage: "tr",
      targetLanguage: "en",
      originalText: "a",
      translatedText: "A",
    });
    await persistTranslation({
      appId: app.id,
      userId: userB.id,
      sourceLanguage: "tr",
      targetLanguage: "en",
      originalText: "b",
      translatedText: "B secret",
    });
    const items = await listHistory(app.id, userA.id);
    expect(items.some((item) => item.translatedText === "A")).toBe(true);
    expect(items.some((item) => item.translatedText.includes("secret"))).toBe(false);
  });
});
