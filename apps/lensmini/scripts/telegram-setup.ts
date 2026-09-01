import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServerEnv, resetServerEnvCache } from "@minifactory/config/env";
import {
  getTelegramBotProfile,
  getTelegramWebhookInfo,
  setTelegramMenuButton,
  setTelegramWebhook,
} from "@minifactory/notifications";

function loadEnv(): void {
  for (const name of [".env", ".env.local", "apps/lensmini/.env.local"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) {
      continue;
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
  resetServerEnvCache();
}

async function main() {
  loadEnv();
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
  const webhookUrl = `${base}/api/telegram/webhook`;
  await setTelegramWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  await setTelegramMenuButton(base, "LensMini");
  const me = await getTelegramBotProfile();
  const info = await getTelegramWebhookInfo();
  console.log("LensMini Telegram setup complete.");
  console.log(`bot=@${me.result?.username ?? "(unknown)"}`);
  console.log(`miniApp=${base}`);
  console.log(`webhook=${info.result?.url ?? "(missing)"}`);
  console.log(`pending=${info.result?.pending_update_count ?? "n/a"}`);
  console.log(`lastError=${info.result?.last_error_message ? "yes" : "none"}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Telegram setup failed");
  process.exit(1);
});
