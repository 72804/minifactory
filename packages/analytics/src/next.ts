import { trackInputSchema } from "./index";
import { track } from "./server";

type SessionLike = {
  app: { id: string };
  user: { id: string } | null;
};

export function createAnalyticsPostHandler(getSession: (request: Request) => Promise<SessionLike>) {
  return async function POST(request: Request): Promise<Response> {
    const session = await getSession(request);
    const json: unknown = await request.json();
    const parsed = trackInputSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: "Invalid analytics payload" }, { status: 400 });
    }
    await track({
      appId: session.app.id,
      userId: session.user?.id ?? null,
      name: parsed.data.name,
      metadata: parsed.data.metadata,
    });
    return Response.json({ ok: true });
  };
}
