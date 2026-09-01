import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describeDatabaseUrl, isExampleDatabaseUrl } from "../../packages/config/src/security.ts";

function loadRootEnv(root = process.cwd()): void {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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

export function requireWritableDatabaseUrl(): string {
  loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and replace DATABASE_URL with a writable Postgres URL.",
    );
  }
  if (isExampleDatabaseUrl(url)) {
    throw new Error(
      `DATABASE_URL is still the example placeholder (${describeDatabaseUrl(url)} with the default postgres role). This machine's Postgres often has no role named postgres. Replace DATABASE_URL, then retry. The URL itself is not printed.`,
    );
  }
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    requireWritableDatabaseUrl();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
