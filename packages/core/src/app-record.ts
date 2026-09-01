import type { AppConfig } from "@minifactory/config";
import { prisma } from "@minifactory/db";

export async function ensureAppRecord(config: AppConfig) {
  return prisma.app.upsert({
    where: { slug: config.slug },
    update: { name: config.name },
    create: { slug: config.slug, name: config.name },
  });
}
