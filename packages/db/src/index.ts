import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv, parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { isExampleDatabaseUrl } from "@minifactory/config/security";

function loadMonorepoEnv(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../.env.local"),
  ];
  for (const path of candidates) {
    if (existsSync(/* turbopackIgnore: true */ path)) {
      loadEnv({ path, override: false });
    }
  }

  const rootEnvPath = resolve(process.cwd(), "../../.env");
  if (!existsSync(/* turbopackIgnore: true */ rootEnvPath)) {
    return;
  }
  const parsed = parse(readFileSync(rootEnvPath));
  const current = process.env.DATABASE_URL;
  if (parsed.DATABASE_URL && (!current || isExampleDatabaseUrl(current))) {
    process.env.DATABASE_URL = parsed.DATABASE_URL;
  }
}

loadMonorepoEnv();

const globalForPrisma = globalThis as typeof globalThis & {
  minifactoryPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.minifactoryPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.minifactoryPrisma = prisma;
}

export { Prisma } from "@prisma/client";
export type { PrismaClient } from "@prisma/client";
