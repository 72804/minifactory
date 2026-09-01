import { requireIdentity } from "@minifactory/core/server";
import { TelegramAuthError } from "@minifactory/telegram/server";
import { z } from "zod";
import { appConfig } from "../../../../app.config";

const ALLOWED_KEYS = new Set([
  "telegramEnv",
  "cameraApi",
  "permission",
  "facingMode",
  "captureWidth",
  "captureHeight",
  "compressedWidth",
  "compressedHeight",
  "compressedBytes",
  "durationMs",
  "providerMs",
  "code",
  "inputMethod",
  "mode",
]);

const bodySchema = z.object({
  event: z.enum([
    "camera_permission",
    "camera_ready",
    "capture",
    "translate_client",
  ]),
  meta: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(request: Request) {
  try {
    await requireIdentity(request, appConfig);
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return Response.json({ ok: false }, { status: 401 });
    }
    return Response.json({ ok: false }, { status: 500 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const meta: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(parsed.data.meta ?? {})) {
    if (ALLOWED_KEYS.has(key)) {
      meta[key] = value;
    }
  }
  console.info("[lensmini] device", { event: parsed.data.event, ...meta });
  return Response.json({ ok: true });
}
