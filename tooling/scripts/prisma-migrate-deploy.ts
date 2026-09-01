import { spawnSync } from "node:child_process";
import { describeDatabaseUrl } from "../../packages/config/src/security.ts";
import { requireWritableDatabaseUrl } from "./require-database-url.ts";

/** Neon pooled hosts include `-pooler.`; Prisma migrate needs the direct host. */
export function neonUnpooledDatabaseUrl(url: string): { url: string; usedUnpooledHost: boolean } {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("-pooler.")) {
      parsed.hostname = parsed.hostname.replace("-pooler.", ".");
      return { url: parsed.toString(), usedUnpooledHost: true };
    }
  } catch {
    return { url, usedUnpooledHost: false };
  }
  return { url, usedUnpooledHost: false };
}

const source = requireWritableDatabaseUrl();
const preferred = process.env.DIRECT_URL?.trim();
const { url, usedUnpooledHost } = preferred
  ? { url: preferred, usedUnpooledHost: false }
  : neonUnpooledDatabaseUrl(source);
console.log(
  `prisma migrate deploy → ${describeDatabaseUrl(url)}${usedUnpooledHost ? " (Neon unpooled host for migrations)" : preferred ? " (DIRECT_URL)" : ""}`,
);

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  },
);

process.exit(result.status ?? 1);
