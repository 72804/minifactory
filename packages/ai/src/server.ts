import { getServerEnv } from "@minifactory/config/env";
import type { z } from "zod";
import {
  AI_MODELS,
  AIProviderError,
  type AIProvider,
  type AnalyzeImageInput,
  type GenerateTextInput,
  type TranscribeAudioInput,
} from "./index";

export {
  AI_MODELS,
  AIProviderError,
  DEFAULT_OPENAI_VISION_MODEL,
  type AIProvider,
  type AnalyzeImageInput,
  type GenerateTextInput,
  type TranscribeAudioInput,
} from "./index";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1200;

type ResponseContentPart = { type?: string; text?: string };
type ResponseOutputItem = { type?: string; content?: ResponseContentPart[] };

type OpenAIResponsesBody = {
  output_text?: string;
  output?: ResponseOutputItem[];
  error?: { message?: string; type?: string };
};

type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "auto" };

async function openaiResponses(input: {
  model: string;
  instructions?: string;
  content: InputContent[];
  json: boolean;
}): Promise<string> {
  const key = getServerEnv().OPENAI_API_KEY;
  if (!key) {
    throw new AIProviderError("OPENAI_API_KEY is not configured");
  }
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.json
        ? {
            text: {
              format: { type: "json_object" },
            },
          }
        : {}),
      input: [
        {
          role: "user",
          content: input.content,
        },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AIProviderError(`OpenAI request failed: ${response.status}`);
  }
  const json = (await response.json()) as OpenAIResponsesBody;
  if (json.error) {
    throw new AIProviderError("OpenAI request failed");
  }
  const text = extractOutputText(json);
  if (!text) {
    throw new AIProviderError("OpenAI returned an empty response");
  }
  return text;
}

function extractOutputText(json: OpenAIResponsesBody): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text;
  }
  const chunks: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type !== "message") {
      continue;
    }
    for (const part of item.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && part.text) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("");
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(slice) as unknown;
}

const mockVisionPayload = {
  sourceLanguage: { code: "tr", name: "Turkish" },
  targetLanguage: { code: "en", name: "English" },
  originalText: "Merhaba dünya",
  translatedText: "Hello world",
  blocks: [
    {
      originalText: "Merhaba dünya",
      translatedText: "Hello world",
      boundingBox: null,
    },
  ],
  confidence: null,
  noText: false,
  unreadable: false,
};

const mockProvider: AIProvider = {
  id: "mock",
  async generateText(input) {
    return `[mock] ${input.prompt.slice(0, 280)}`;
  },
  async generateStructured(input, schema) {
    const parsed = schema.safeParse(mockVisionPayload);
    if (parsed.success) {
      return parsed.data;
    }
    return schema.parse({ result: input.prompt, translatedText: input.prompt });
  },
  async analyzeImage() {
    return JSON.stringify(mockVisionPayload);
  },
  async analyzeImageStructured(_input, schema) {
    return schema.parse(mockVisionPayload);
  },
  async transcribeAudio() {
    return "[mock] transcription is not implemented";
  },
};

const openaiProvider: AIProvider = {
  id: "openai",
  async generateText(input) {
    return openaiResponses({
      model: AI_MODELS.text,
      instructions: input.system,
      json: false,
      content: [{ type: "input_text", text: input.prompt }],
    });
  },
  async generateStructured(input, schema) {
    const content = await openaiResponses({
      model: AI_MODELS.text,
      instructions: `${input.system ?? "Return valid JSON only."}\nRespond with a JSON object and no markdown.`.trim(),
      json: true,
      content: [{ type: "input_text", text: input.prompt }],
    });
    return schema.parse(parseJsonObject(content));
  },
  async analyzeImage(input) {
    return openaiResponses({
      model: AI_MODELS.vision,
      instructions: `${input.system ?? "Describe the image."}\nRespond with a JSON object and no markdown.`.trim(),
      json: true,
      content: [
        { type: "input_text", text: input.prompt },
        {
          type: "input_image",
          image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
          detail: "low",
        },
      ],
    });
  },
  async analyzeImageStructured(input, schema) {
    const content = await openaiResponses({
      model: AI_MODELS.vision,
      instructions: `${input.system ?? "Return valid JSON only."}\nRespond with a JSON object and no markdown.`.trim(),
      json: true,
      content: [
        { type: "input_text", text: input.prompt },
        {
          type: "input_image",
          image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
          detail: "low",
        },
      ],
    });
    return schema.parse(parseJsonObject(content));
  },
  async transcribeAudio(_input: TranscribeAudioInput) {
    throw new AIProviderError("Audio transcription is not enabled");
  },
};

export function createAIProvider(id: "mock" | "openai" | undefined = undefined): AIProvider {
  if (id === "mock") {
    return mockProvider;
  }
  if (id === "openai" || getServerEnv().OPENAI_API_KEY) {
    return openaiProvider;
  }
  return mockProvider;
}

export async function generateText(input: GenerateTextInput, provider?: AIProvider): Promise<string> {
  return (provider ?? createAIProvider()).generateText(input);
}

export async function generateStructured<T>(
  input: GenerateTextInput,
  schema: z.ZodType<T>,
  provider?: AIProvider,
): Promise<T> {
  return (provider ?? createAIProvider()).generateStructured(input, schema);
}

export async function analyzeImage(
  input: AnalyzeImageInput,
  provider?: AIProvider,
): Promise<string> {
  return (provider ?? createAIProvider()).analyzeImage(input);
}

export async function analyzeImageStructured<T>(
  input: AnalyzeImageInput,
  schema: z.ZodType<T>,
  provider?: AIProvider,
): Promise<T> {
  return (provider ?? createAIProvider()).analyzeImageStructured(input, schema);
}

export async function transcribeAudio(
  input: TranscribeAudioInput,
  provider?: AIProvider,
): Promise<string> {
  return (provider ?? createAIProvider()).transcribeAudio(input);
}
