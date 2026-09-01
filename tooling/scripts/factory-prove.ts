import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "../../packages/db/src/index.ts";
import { requireWritableDatabaseUrl } from "./require-database-url.ts";
import { proveIsolationAndUsage } from "../../packages/core/src/isolation-prove.ts";

function waitFor(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url);
        if (response.ok || response.status === 404) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(() => void tick(), 300);
    };
    void tick();
  });
}

async function main() {
  requireWritableDatabaseUrl();
  const port = process.env.FACTORY_PROVE_PORT ?? "3100";
  const base = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(
    "pnpm",
    ["--filter", "@minifactory/template", "exec", "next", "dev", "--port", port],
    { stdio: "inherit", env: { ...process.env, ALLOW_TELEGRAM_MOCK: "true", NEXT_PUBLIC_TELEGRAM_MOCK: "true" } },
  );

  const stop = () => {
    child.kill("SIGTERM");
  };
  process.on("exit", stop);

  try {
    await waitFor(base);
    const headers = { authorization: "tma-mock", "content-type": "application/json" };
    const sessionRes = await fetch(`${base}/api/mf/session`, { method: "POST", headers });
    if (!sessionRes.ok) {
      throw new Error(`Session failed: ${sessionRes.status} ${await sessionRes.text()}`);
    }
    const session = (await sessionRes.json()) as { user: { id: string }; app: { id: string; slug: string } };
    const processRes = await fetch(`${base}/api/process`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "hello" }),
    });
    if (!processRes.ok) {
      throw new Error(`Process failed: ${processRes.status} ${await processRes.text()}`);
    }
    const payload = (await processRes.json()) as { result: string };
    if (!payload.result.includes("HELLO")) {
      throw new Error("Process result did not transform text");
    }

    const [user, app, appUser, usage, analytics] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId: "100000001" } }),
      prisma.app.findUnique({ where: { slug: "template" } }),
      prisma.appUser.findFirst({ where: { user: { telegramId: "100000001" }, app: { slug: "template" } } }),
      prisma.usageEvent.findFirst({
        where: { feature: "process", user: { telegramId: "100000001" }, app: { slug: "template" } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.analyticsEvent.findFirst({
        where: { name: "action_completed", user: { telegramId: "100000001" }, app: { slug: "template" } },
      }),
    ]);
    if (!user || !app || !appUser || !usage || !analytics) {
      throw new Error("Expected User, App, AppUser, UsageEvent, and AnalyticsEvent rows after the mock action");
    }

    const isolation = await proveIsolationAndUsage();
    console.log(
      JSON.stringify(
        {
          sessionApp: session.app.slug,
          userCreated: Boolean(user),
          appUsersForTelegram123: isolation.appUsers,
          demoCounters: isolation.demoCounters,
          templateCounters: isolation.templateCounters,
        },
        null,
        2,
      ),
    );
    console.log("factory:prove passed");
  } finally {
    stop();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
