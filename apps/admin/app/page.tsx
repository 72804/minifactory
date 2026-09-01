import { prisma } from "@minifactory/db";
import { Card, PageHeader } from "@minifactory/ui";
import { isAdminAuthenticated, adminAccessDeniedReason } from "../lib/auth";

export const dynamic = "force-dynamic";

async function loadStats() {
  const [apps, users, opens, completed, failed, purchases] = await Promise.all([
    prisma.app.count(),
    prisma.user.count(),
    prisma.analyticsEvent.count({ where: { name: "app_open" } }),
    prisma.analyticsEvent.count({ where: { name: "action_completed" } }),
    prisma.analyticsEvent.count({ where: { name: "action_failed" } }),
    prisma.purchase.count({ where: { status: "paid" } }),
  ]);
  const appRows = await prisma.app.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true, createdAt: true },
  });
  return { apps, users, opens, completed, failed, purchases, appRows };
}

function LoginForm({ error }: { error?: string }) {
  return (
    <Card>
      <PageHeader title="MiniFactory Admin" description="Internal portfolio view" />
      {error ? <p style={{ color: "var(--mf-danger)" }}>{error}</p> : null}
      <form action="/api/login" method="post">
        <label htmlFor="secret">Admin secret</label>
        <input className="mf-input" id="secret" name="secret" type="password" required />
        <div style={{ height: 12 }} />
        <button className="mf-btn" type="submit">
          Enter
        </button>
      </form>
    </Card>
  );
}

export default async function AdminPage() {
  const denied = adminAccessDeniedReason();
  if (denied) {
    return (
      <Card>
        <PageHeader title="Admin locked" description={denied} />
      </Card>
    );
  }
  if (!(await isAdminAuthenticated())) {
    return <LoginForm />;
  }

  let stats: Awaited<ReturnType<typeof loadStats>>;
  try {
    stats = await loadStats();
  } catch {
    return (
      <Card>
        <PageHeader
          title="Database unavailable"
          description="Start PostgreSQL and set DATABASE_URL, then migrate the schema."
        />
      </Card>
    );
  }

  const cards = [
    ["Apps", stats.apps],
    ["Users", stats.users],
    ["Opens", stats.opens],
    ["Completed actions", stats.completed],
    ["Errors", stats.failed],
    ["Purchases", stats.purchases],
  ] as const;

  return (
    <>
      <PageHeader title="Portfolio" description="Shared visibility across Mini Apps" />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        {cards.map(([label, value]) => (
          <Card key={label}>
            <p style={{ margin: 0, color: "var(--mf-muted)" }}>{label}</p>
            <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700 }}>{value}</p>
          </Card>
        ))}
      </div>
      <div style={{ height: 16 }} />
      <Card>
        <h2 style={{ marginTop: 0 }}>Apps</h2>
        {stats.appRows.length === 0 ? (
          <p style={{ margin: 0, color: "var(--mf-muted)" }}>No apps have been opened yet.</p>
        ) : (
          <ul>
            {stats.appRows.map((app) => (
              <li key={app.slug}>
                {app.name} <code>{app.slug}</code>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
