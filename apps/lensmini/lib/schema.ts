import { z } from "zod";
import { isSupportedLanguage, languageName } from "./languages";

export const boundingBoxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .nullable();

export const translationBlockSchema = z.object({
  originalText: z.string(),
  translatedText: z.string(),
  boundingBox: boundingBoxSchema.nullish().transform((value) => value ?? null),
});

export const languageRefSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const translationResultSchema = z.object({
  sourceLanguage: languageRefSchema,
  targetLanguage: languageRefSchema,
  originalText: z.string(),
  translatedText: z.string(),
  blocks: z.array(translationBlockSchema).default([]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional()
    .transform((value) => (typeof value === "number" ? value : null)),
});

export const visionProviderSchema = translationResultSchema.extend({
  noText: z.boolean().optional().default(false),
  unreadable: z.boolean().optional().default(false),
});

export const translateRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(6_000_000).optional(),
    mimeType: z.string().optional(),
    originalText: z.string().trim().min(1).max(20_000).optional(),
    targetLanguage: z.string().min(1).max(16),
    sourceLanguage: z.string().max(16).optional(),
    inputMethod: z.enum(["camera", "upload"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.imageBase64 && !value.originalText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Image or extracted text is required",
        path: ["imageBase64"],
      });
    }
    if (!isSupportedLanguage(value.targetLanguage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported target language",
        path: ["targetLanguage"],
      });
    }
    if (value.sourceLanguage && value.sourceLanguage !== "auto" && !isSupportedLanguage(value.sourceLanguage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported source language",
        path: ["sourceLanguage"],
      });
    }
  });

export type TranslationResult = z.infer<typeof translationResultSchema>;
export type VisionProviderResult = z.infer<typeof visionProviderSchema>;
export type TranslateRequest = z.infer<typeof translateRequestSchema>;

export function languageRef(code: string) {
  return { code, name: languageName(code) };
}

export function publicErrorMessage(code: string): string {
  switch (code) {
    case "no_text":
      return "I couldn't find readable text in this image.";
    case "unreadable":
      return "Try moving closer or holding the camera steady.";
    case "unsupported_type":
      return "This image format isn't supported.";
    case "too_large":
      return "That image is too large. Try another photo.";
    case "usage_limit":
      return "You've used today's 5 free translations.";
    case "unsupported_language":
      return "That language isn't supported yet.";
    case "missing_target":
      return "Choose a target language.";
    default:
      return "Translation failed. Try again.";
  }
}
