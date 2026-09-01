import { defineAppConfig, type AppConfig } from "@minifactory/config";
import { prisma } from "@minifactory/db";
import { consumeUsage, UsageLimitError } from "./usage";

function testConfig(slug: string, freePerDay: number): AppConfig {
  return defineAppConfig({
    id: slug,
    name: slug,
    slug,
    description: "audit",
    botUsername: "AuditBot",
    productionUrl: "",
    theme: { accent: "#0ea5e9", radius: "16px", fontFamily: "system-ui" },
    listing: {
      shortDescription: "audit",
      longDescription: "audit",
      category: "utilities",
      keywords: [],
    },
    capabilities: ["telegramAuth", "database"],
    limits: {
      anonymousUsage: false,
      features: {
        process: { freePerDay, extraAfterAd: 0, premiumUnlimited: false, unlimited: false },
      },
    },
  });
}

export async function proveIsolationAndUsage() {
  const telegramId = "123";
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { firstName: "Audit" },
    create: { telegramId, firstName: "Audit" },
  });
  const demo = await prisma.app.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Mini" },
    create: { slug: "demo", name: "Demo Mini" },
  });
  const template = await prisma.app.upsert({
    where: { slug: "template" },
    update: { name: "Template Mini" },
    create: { slug: "template", name: "Template Mini" },
  });

  await prisma.appUser.upsert({
    where: { appId_userId: { appId: demo.id, userId: user.id } },
    update: {},
    create: { appId: demo.id, userId: user.id },
  });
  await prisma.appUser.upsert({
    where: { appId_userId: { appId: template.id, userId: user.id } },
    update: {},
    create: { appId: template.id, userId: user.id },
  });

  await prisma.usageCounter.deleteMany({
    where: { userId: user.id, feature: "process" },
  });
  await prisma.usageEvent.deleteMany({
    where: { userId: user.id, feature: "process" },
  });

  const demoConfig = testConfig("demo", 3);
  const templateConfig = testConfig("template", 3);

  for (let i = 0; i < 3; i += 1) {
    const result = await consumeUsage({
      config: demoConfig,
      appId: demo.id,
      userId: user.id,
      feature: "process",
    });
    if (!result.allowed) {
      throw new Error(`Demo request ${i + 1} should succeed`);
    }
  }
  let rejected = false;
  try {
    await consumeUsage({
      config: demoConfig,
      appId: demo.id,
      userId: user.id,
      feature: "process",
    });
  } catch (error) {
    rejected = error instanceof UsageLimitError;
  }
  if (!rejected) {
    throw new Error("Fourth demo request should be rejected");
  }

  const templateUsage = await consumeUsage({
    config: templateConfig,
    appId: template.id,
    userId: user.id,
    feature: "process",
  });
  if (!templateUsage.allowed || templateUsage.remaining !== 2) {
    throw new Error("Template usage must be independent of demo usage");
  }

  const nextPeriod = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const reset = await consumeUsage({
    config: demoConfig,
    appId: demo.id,
    userId: user.id,
    feature: "process",
    now: nextPeriod,
  });
  if (!reset.allowed) {
    throw new Error("Usage should reset on the next UTC calendar day");
  }
  const almostLast = await consumeUsage({
    config: demoConfig,
    appId: demo.id,
    userId: user.id,
    feature: "process",
    now: nextPeriod,
  });
  if (!almostLast.allowed || almostLast.remaining !== 1) {
    throw new Error("Expected one credit remaining before the race");
  }

  const racing = await Promise.allSettled([
    consumeUsage({
      config: demoConfig,
      appId: demo.id,
      userId: user.id,
      feature: "process",
      now: nextPeriod,
    }),
    consumeUsage({
      config: demoConfig,
      appId: demo.id,
      userId: user.id,
      feature: "process",
      now: nextPeriod,
    }),
  ]);
  const raceWins = racing.filter((item) => item.status === "fulfilled").length;
  const raceRejects = racing.filter(
    (item) => item.status === "rejected" && item.reason instanceof UsageLimitError,
  ).length;
  if (raceWins + raceRejects !== 2 || raceWins !== 1) {
    throw new Error("Exactly one of two concurrent last-credit requests should succeed");
  }

  const [users, appUsers, demoCounters, templateCounters] = await Promise.all([
    prisma.user.count({ where: { telegramId } }),
    prisma.appUser.count({ where: { userId: user.id } }),
    prisma.usageCounter.findMany({ where: { appId: demo.id, userId: user.id } }),
    prisma.usageCounter.findMany({ where: { appId: template.id, userId: user.id } }),
  ]);

  return {
    users,
    appUsers,
    demoCounters: demoCounters.map((row) => ({ periodKey: row.periodKey, count: row.count })),
    templateCounters: templateCounters.map((row) => ({ periodKey: row.periodKey, count: row.count })),
  };
}
