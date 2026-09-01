import { analyzeImageStructured, createAIProvider, generateStructured, AIProviderError, type AIProvider } from "@minifactory/ai/server";
import { track } from "@minifactory/analytics/server";
import { requireIdentity, consumeUsage, refundUsage, UsageLimitError } from "@minifactory/core/server";
import { MediaValidationError, OCR_IMAGE_LIMITS, decodeBase64Image, validateOcrImageBuffer } from "@minifactory/media/server";
import { TelegramAuthError } from "@minifactory/telegram/server";
import { ZodError } from "zod";
import { AI_MODELS } from "@minifactory/ai";
import { appConfig, TRANSLATE_FEATURE, TRANSLATE_FREE_PER_DAY } from "../app.config";
import { isSupportedLanguage, languageName } from "./languages";
import { RETRANSLATE_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, retranslateUserPrompt, visionUserPrompt } from "./prompt";
import {
  languageRef,
  publicErrorMessage,
  translateRequestSchema,
  translationResultSchema,
  visionProviderSchema,
  type TranslationResult,
} from "./schema";
import { persistTranslation } from "./history";

const HISTORY_MAX = 20;

function durationBucket(ms: number): string {
  if (ms < 1000) return "0-1s";
  if (ms < 3000) return "1-3s";
  if (ms < 8000) return "3-8s";
  return "8s+";
}

function resolveProvider(override?: AIProvider): AIProvider {
  if (override) {
    return override;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return createAIProvider("mock");
  }
  return createAIProvider();
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function mapAuthError(error: unknown): Response | null {
  if (error instanceof TelegramAuthError) {
    return json({ error: error.message, code: "unauthorized" }, 401);
  }
  return null;
}

function normalizeBlocks(result: TranslationResult): TranslationResult {
  const blocks =
    result.blocks.length > 0
      ? result.blocks
      : result.originalText.trim()
        ? [
            {
              originalText: result.originalText,
              translatedText: result.translatedText,
              boundingBox: null,
            },
          ]
        : [];
  return { ...result, blocks };
}

export async function handleTranslateRequest(
  request: Request,
  options?: { provider?: AIProvider },
): Promise<Response> {
  const started = Date.now();
  let session: Awaited<ReturnType<typeof requireIdentity>> | undefined;
  try {
    session = await requireIdentity(request, appConfig, TRANSLATE_FEATURE);
  } catch (error) {
    return mapAuthError(error) ?? json({ error: "Translation failed. Try again.", code: "failed" }, 500);
  }

  let parsedJson: unknown;
  try {
    parsedJson = await request.json();
  } catch {
    return json({ error: "Translation failed. Try again.", code: "invalid" }, 400);
  }

  const parsed = translateRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    if (path === "targetLanguage" && !("targetLanguage" in ((parsedJson as { targetLanguage?: string }) ?? {}))) {
      return json({ error: publicErrorMessage("missing_target"), code: "missing_target" }, 400);
    }
    if (issue?.message.includes("Unsupported target") || path === "targetLanguage") {
      const raw = (parsedJson as { targetLanguage?: unknown } | null)?.targetLanguage;
      if (raw === undefined || raw === "") {
        return json({ error: publicErrorMessage("missing_target"), code: "missing_target" }, 400);
      }
      return json({ error: publicErrorMessage("unsupported_language"), code: "unsupported_language" }, 400);
    }
    return json({ error: "Translation failed. Try again.", code: "invalid" }, 400);
  }

  const body = parsed.data;
  const inputMethod = body.inputMethod ?? (body.imageBase64 ? "camera" : "upload");
  const mode = body.originalText && !body.imageBase64 ? "retranslate" : "vision";
  let mimeType: string | undefined;
  let imageBytes = 0;

  if (body.imageBase64) {
    try {
      if (body.imageBase64.length > OCR_IMAGE_LIMITS.maxBytes * 1.4) {
        throw new MediaValidationError("That image is too large. Try another photo.", "too_large");
      }
      const bytes = decodeBase64Image(body.imageBase64);
      imageBytes = bytes.byteLength;
      mimeType = validateOcrImageBuffer(bytes, body.mimeType);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        console.info("[lensmini] translate", {
          mock: session.mock,
          mode,
          inputMethod,
          code: error.code,
          imageBytes,
        });
        return json(
          { error: publicErrorMessage(error.code === "too_large" ? "too_large" : "unsupported_type"), code: error.code },
          400,
        );
      }
      return json({ error: publicErrorMessage("unsupported_type"), code: "unsupported_type" }, 400);
    }
  }

  const provider = resolveProvider(options?.provider);
  const metadataBase = {
    targetLanguage: body.targetLanguage,
    inputMethod,
    mode,
  };

  if (appConfig.analytics.enabled) {
    await track({
      appId: session.app.id,
      userId: session.user.id,
      name: "translation_started",
      metadata: metadataBase,
    });
  }

  try {
    const usage = await consumeUsage({
      config: appConfig,
      appId: session.app.id,
      userId: session.user.id,
      feature: TRANSLATE_FEATURE,
    });

    const aiStarted = Date.now();
    let vision: ReturnType<typeof visionProviderSchema.parse>;
    try {
      vision = visionProviderSchema.parse(
        body.imageBase64 && mimeType
          ? await analyzeImageStructured(
              {
                imageBase64: body.imageBase64,
                mimeType,
                system: VISION_SYSTEM_PROMPT,
                prompt: visionUserPrompt(body.targetLanguage, body.sourceLanguage),
              },
              visionProviderSchema,
              provider,
            )
          : await generateStructured(
              {
                system: RETRANSLATE_SYSTEM_PROMPT,
                prompt: retranslateUserPrompt({
                  originalText: body.originalText ?? "",
                  sourceLanguage: body.sourceLanguage,
                  targetLanguage: body.targetLanguage,
                }),
              },
              visionProviderSchema,
              provider,
            ),
      );
    } catch (error) {
      await refundUsage({
        appId: session.app.id,
        userId: session.user.id,
        feature: TRANSLATE_FEATURE,
      });
      throw error;
    }
    const providerMs = Date.now() - aiStarted;

    vision = {
      ...vision,
      targetLanguage: languageRef(body.targetLanguage),
      sourceLanguage: isSupportedLanguage(vision.sourceLanguage.code)
        ? { code: vision.sourceLanguage.code, name: languageName(vision.sourceLanguage.code) }
        : vision.sourceLanguage,
    };

    if (vision.unreadable) {
      if (appConfig.analytics.enabled) {
        await track({
          appId: session.app.id,
          userId: session.user.id,
          name: "translation_failed",
          metadata: { ...metadataBase, reason: "unreadable", durationBucket: durationBucket(providerMs) },
        });
      }
      return json({ error: publicErrorMessage("unreadable"), code: "unreadable", usage }, 422);
    }

    if (vision.noText || !vision.originalText.trim()) {
      if (appConfig.analytics.enabled) {
        await track({
          appId: session.app.id,
          userId: session.user.id,
          name: "no_text_detected",
          metadata: { ...metadataBase, durationBucket: durationBucket(providerMs) },
        });
      }
      return json({ error: publicErrorMessage("no_text"), code: "no_text", usage }, 422);
    }

    let result: TranslationResult;
    try {
      result = normalizeBlocks(translationResultSchema.parse(vision));
      await persistTranslation({
        appId: session.app.id,
        userId: session.user.id,
        sourceLanguage: result.sourceLanguage.code,
        targetLanguage: result.targetLanguage.code,
        originalText: result.originalText,
        translatedText: result.translatedText,
        keep: HISTORY_MAX,
      });
    } catch (error) {
      await refundUsage({
        appId: session.app.id,
        userId: session.user.id,
        feature: TRANSLATE_FEATURE,
      });
      throw error;
    }

    if (appConfig.analytics.enabled) {
      await track({
        appId: session.app.id,
        userId: session.user.id,
        name: "translation_completed",
        metadata: {
          ...metadataBase,
          sourceLanguage: result.sourceLanguage.code,
          durationBucket: durationBucket(providerMs),
          providerMs,
        },
      });
    }

    console.info("[lensmini] translate", {
      mock: session.mock,
      mode,
      inputMethod,
      mimeType: mimeType ?? null,
      imageBytes,
      sentImage: Boolean(body.imageBase64),
      code: "ok",
      durationMs: Date.now() - started,
      providerMs,
      remaining: usage.remaining,
    });
    return json({ ...result, usage, providerMs });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      if (appConfig.analytics.enabled) {
        await track({
          appId: session.app.id,
          userId: session.user.id,
          name: "usage_limit_hit",
          metadata: metadataBase,
        });
      }
      console.info("[lensmini] translate", {
        mock: session.mock,
        mode,
        inputMethod,
        sentImage: Boolean(body.imageBase64),
        code: "usage_limit",
      });
      return json(
        {
          error: publicErrorMessage("usage_limit"),
          code: "usage_limit",
          usage: error.decision,
          limit: TRANSLATE_FREE_PER_DAY,
        },
        429,
      );
    }
    if (appConfig.analytics.enabled) {
      await track({
        appId: session.app.id,
        userId: session.user.id,
        name: "translation_failed",
        metadata: {
          ...metadataBase,
          reason: error instanceof AIProviderError ? "provider" : error instanceof ZodError ? "schema" : "unknown",
          durationBucket: durationBucket(Date.now() - started),
        },
      });
    }
    if (error instanceof AIProviderError || error instanceof ZodError) {
      console.error(
        "[lensmini] translation failed",
        error instanceof ZodError ? "invalid_provider_json" : error.category,
        {
          providerStatus: error instanceof AIProviderError ? (error.providerStatus ?? null) : null,
          providerType: error instanceof AIProviderError ? (error.providerType ?? null) : null,
          model: AI_MODELS.vision,
          provider: provider.id,
        },
      );
      return json({ error: publicErrorMessage("failed"), code: "failed" }, 502);
    }
    console.error("[lensmini] translation failed");
    return json({ error: publicErrorMessage("failed"), code: "failed" }, 500);
  }
}
