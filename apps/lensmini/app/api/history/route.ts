import { requireIdentity } from "@minifactory/core/server";
import { TelegramAuthError } from "@minifactory/telegram/server";
import { appConfig, TRANSLATE_FEATURE } from "../../../app.config";
import { clearHistory, deleteHistoryEntry, listHistory } from "../../../lib/history";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function identity(request: Request) {
  return requireIdentity(request, appConfig, TRANSLATE_FEATURE);
}

export async function GET(request: Request) {
  try {
    const session = await identity(request);
    const items = await listHistory(session.app.id, session.user.id);
    return json({ items });
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return json({ error: error.message, code: "unauthorized" }, 401);
    }
    return json({ error: "Could not load history" }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await identity(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const deleted = await deleteHistoryEntry(session.app.id, session.user.id, id);
      return json({ ok: deleted });
    }
    const count = await clearHistory(session.app.id, session.user.id);
    return json({ ok: true, count });
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return json({ error: error.message, code: "unauthorized" }, 401);
    }
    return json({ error: "Could not update history" }, 500);
  }
}
