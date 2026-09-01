import type { z } from "zod";

const DEFAULT_VISION_MODEL = "gpt-5.6-luna";

export const AI_MODELS = {
  get vision() {
    return process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
  },
  get text() {
    return process.env.OPENAI_MODEL || process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
  },
} as const;

export const DEFAULT_OPENAI_VISION_MODEL = DEFAULT_VISION_MODEL;

export type GenerateTextInput = {
  prompt: string;
  system?: string;
};

export type AnalyzeImageInput = {
  prompt: string;
  system?: string;
  imageBase64: string;
  mimeType: string;
};

export type TranscribeAudioInput = {
  audioBase64: string;
  mimeType: string;
};

export type AIProvider = {
  id: string;
  generateText: (input: GenerateTextInput) => Promise<string>;
  generateStructured: <T>(input: GenerateTextInput, schema: z.ZodType<T>) => Promise<T>;
  analyzeImage: (input: AnalyzeImageInput) => Promise<string>;
  analyzeImageStructured: <T>(input: AnalyzeImageInput, schema: z.ZodType<T>) => Promise<T>;
  transcribeAudio: (input: TranscribeAudioInput) => Promise<string>;
};

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}
