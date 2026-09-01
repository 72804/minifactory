import { z } from "zod";
import { isExampleDatabaseUrl, isProductionEnv } from "./security";

const adsProviderSchema = z.enum(["disabled", "mock"]);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().optional().default(86_400),
  APP_BASE_URL: z.string().optional().default("http://localhost:3000"),
  ADMIN_SECRET: z.string().optional().default(""),
  ALLOW_TELEGRAM_MOCK: z.string().optional().default("false"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_VISION_MODEL: z.string().optional().default(""),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
  ADS_PROVIDER: adsProviderSchema.optional().default("disabled"),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_TELEGRAM_MOCK: z.string().optional().default("false"),
  NEXT_PUBLIC_APP_SLUG: z.string().optional().default(""),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const ENV_GROUPS = {
  requiredServer: ["DATABASE_URL", "TELEGRAM_BOT_TOKEN"] as const,
  optionalServer: [
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS",
    "APP_BASE_URL",
    "ADMIN_SECRET",
    "OPENAI_API_KEY",
    "OPENAI_VISION_MODEL",
    "BLOB_READ_WRITE_TOKEN",
    "ADS_PROVIDER",
  ] as const,
  publicBrowser: ["NEXT_PUBLIC_TELEGRAM_MOCK", "NEXT_PUBLIC_APP_SLUG", "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME"] as const,
  developmentOnly: ["ALLOW_TELEGRAM_MOCK", "NEXT_PUBLIC_TELEGRAM_MOCK"] as const,
};

let cachedServerEnv: ServerEnv | undefined;

export function resetServerEnvCache(): void {
  cachedServerEnv = undefined;
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid server environment. Check required variables in .env.example.");
  }
  cachedServerEnv = parsed.data;
  return parsed.data;
}

export function getPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_TELEGRAM_MOCK: process.env.NEXT_PUBLIC_TELEGRAM_MOCK,
    NEXT_PUBLIC_APP_SLUG: process.env.NEXT_PUBLIC_APP_SLUG,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  });
}

export function assertDatabaseUrl(): string {
  const url = getServerEnv().DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and replace it with a writable Postgres URL.",
    );
  }
  if (isExampleDatabaseUrl(url)) {
    throw new Error(
      "DATABASE_URL is still the example placeholder (postgres/postgres@localhost). Homebrew and many local installs use your OS username, not the role `postgres`. Replace DATABASE_URL, then retry. Do not commit the real URL.",
    );
  }
  return url;
}

export function isTelegramMockAllowed(): boolean {
  if (isProductionEnv()) {
    return false;
  }
  return getServerEnv().ALLOW_TELEGRAM_MOCK === "true";
}

export function assertAdminSecret(): string {
  const secret = getServerEnv().ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured");
  }
  return secret;
}
