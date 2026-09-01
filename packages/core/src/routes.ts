import type { AppConfig } from "@minifactory/config";
import { createAnalyticsPostHandler } from "@minifactory/analytics/next";
import { track } from "@minifactory/analytics/server";
import { TelegramAuthError } from "@minifactory/telegram/server";
import { createSession, requireIdentity } from "./session";
import { consumeUsage, UsageLimitError } from "./usage";
import { z } from "zod";

function jsonError(error: unknown): Response {
  if (error instanceof TelegramAuthError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  if (message.includes("DATABASE_URL") || message.includes("P1010") || message.includes("P1000")) {
    return Response.json(
      {
        error:
          "Database is not ready. Set a writable DATABASE_URL in the root .env (not the example postgres/postgres URL), then run pnpm db:push.",
      },
      { status: 503 },
    );
  }
  return Response.json({ error: "Server error" }, { status: 500 });
}

export function createSessionRoute(config: AppConfig) {
  return {
    POST: async (request: Request) => {
      try {
        const session = await createSession(request, config);
        return Response.json(session);
      } catch (error) {
        return jsonError(error);
      }
    },
  };
}

export function createAnalyticsRoute(config: AppConfig) {
  const handler = createAnalyticsPostHandler((request) => requireIdentity(request, config));
  return {
    POST: async (request: Request) => {
      try {
        return await handler(request);
      } catch (error) {
        return jsonError(error);
      }
    },
  };
}

const processBodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export function createTextProcessRoute(config: AppConfig, feature = "process") {
  return {
    POST: async (request: Request) => {
      try {
        const session = await requireIdentity(request, config, feature);
        const parsed = processBodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: "Enter some text to process" }, { status: 400 });
        }

        if (config.analytics.enabled) {
          await track({
            appId: session.app.id,
            userId: session.user.id,
            name: "action_started",
            metadata: { feature },
          });
        }

        try {
          const usage = await consumeUsage({
            config,
            appId: session.app.id,
            userId: session.user.id,
            feature,
          });
          const result = `${parsed.data.text.toUpperCase()} | ${[...parsed.data.text].reverse().join("")}`;
          if (config.analytics.enabled) {
            await track({
              appId: session.app.id,
              userId: session.user.id,
              name: "action_completed",
              metadata: { feature },
            });
          }
          return Response.json({ result, usage });
        } catch (error) {
          if (config.analytics.enabled) {
            await track({
              appId: session.app.id,
              userId: session.user.id,
              name: "action_failed",
              metadata: { feature },
            });
          }
          if (error instanceof UsageLimitError) {
            return Response.json(
              { error: "Daily free usage reached", code: "usage_limit", usage: error.decision },
              { status: 429 },
            );
          }
          throw error;
        }
      } catch (error) {
        return jsonError(error);
      }
    },
  };
}
