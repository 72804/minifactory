import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getServerEnv, resetServerEnvCache } from "@minifactory/config/env";
import { configureTelegramBot, resolveTelegramPresentation } from "@minifactory/telegram/server";
import { appConfig } from "../app.config";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_DIR, "../..");

function parseEnvFile(path: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(path)) {
    return parsed;
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
    parsed[key] = value;
  }
  return parsed;
}

function loadEnv(): string[] {
  const preset = new Set(
    Object.keys(process.env).filter((key) => process.env[key] !== undefined),
  );
  const loaded: string[] = [];
  const fromFiles: Record<string, string> = {};
  for (const path of [
    resolve(REPO_ROOT, ".env"),
    resolve(REPO_ROOT, ".env.local"),
    resolve(APP_DIR, ".env.local"),
  ]) {
    if (!existsSync(path)) {
      continue;
    }
    loaded.push(path);
    Object.assign(fromFiles, parseEnvFile(path));
  }
  for (const [key, value] of Object.entries(fromFiles)) {
    if (!preset.has(key)) {
      process.env[key] = value;
    }
  }
  resetServerEnvCache();
  return loaded;
}

async function main() {
  const loaded = loadEnv();
  const envFiles = loaded.map((path) => relative(REPO_ROOT, path) || path);
  console.log(`envFiles=${envFiles.join(",") || "(none)"}`);
  const env = getServerEnv();
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  if (!base.startsWith("https://")) {
    throw new Error("APP_BASE_URL must be an https origin for Telegram webhooks and Mini Apps.");
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set for LensMini.");
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is not set for LensMini.");
  }
  console.log(`miniApp=${base}`);
  if (process.argv.includes("--dry-run")) {
    console.log(
      `loadedLensMiniEnv=${envFiles.includes("apps/lensmini/.env.local") ? "yes" : "no"}`,
    );
    return;
  }
  const presentation = resolveTelegramPresentation(appConfig);
  const report = await configureTelegramBot({
    appDir: APP_DIR,
    webhookUrl: `${base}/api/telegram/webhook`,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    miniAppUrl: base,
    presentation,
  });
  console.log("LensMini Telegram setup complete.");
  console.log(`bot=${report.bot}`);
  console.log(`profilePhoto=${report.profilePhoto}`);
  console.log(`name=${report.name}`);
  console.log(`shortDescription=${report.shortDescription}`);
  console.log(`description=${report.description}`);
  console.log(`commands=${report.commands}`);
  console.log(`menuButton=${report.menuButton}`);
  console.log(`webhook=${report.webhook}`);
  console.log(`pending=${report.pending}`);
  console.log(`lastError=${report.lastError}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Telegram setup failed");
  process.exit(1);
});
