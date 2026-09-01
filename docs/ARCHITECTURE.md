# Architecture

MiniFactory is a pnpm + Turborepo + Next.js App Router monorepo. The unit of shipping is one Mini App under `apps/<slug>`, deployed as its own Vercel project.

## Why this shape

Building Mini App #25 should mean writing `app.config.ts`, a few screens, and one or two route handlers. Auth, usage, analytics, payments interfaces, ads interfaces, UI, and Telegram plumbing should already exist.

## Technical decisions

1. **Repo root is MiniFactory.** The workspace folder is the factory. Nested `minifactory/` would only add path noise.
2. **One PostgreSQL database, many apps.** `User.telegramId` is global. `AppUser` is the per-app relationship. A Telegram user can use every Mini App.
3. **Manifest-driven apps.** `defineAppConfig()` in `app.config.ts` is the source of theme, capabilities, usage limits, listing metadata, and shell flags.
4. **Packages export TypeScript source.** Next.js `transpilePackages` compiles them. Apps do not vendor copies of infrastructure.
5. **Telegram identity is server-validated.** Clients send `Authorization: tma <initData>`. The server HMAC-checks it with `TELEGRAM_BOT_TOKEN`. Mock auth (`tma-mock`) requires non-production `ALLOW_TELEGRAM_MOCK=true` and never runs in production.
6. **Route re-exports.** Shared handlers live in `@minifactory/core/server`. Each app keeps thin `app/api/mf/*` files so Vercel still has app-local routes.
7. **Payments grant on webhook confirmation only.** Client payment callbacks are not trusted.
8. **Ads and AI are provider interfaces.** OpenAI Responses vision is wired in `@minifactory/ai` for apps with capability `ai`. Keys stay server-side.
9. **Admin is a separate app.** Cross-app analytics must not ship inside consumer Mini Apps.
10. **No Cache Components, Redis, queues, or Kubernetes.** Mini Apps are per-user and request-driven. Extra infra is postponed until a concrete app needs it.
11. **Vercel ignored builds use `turbo-ignore @minifactory/<slug>`.** Shared-package changes still redeploy dependents; unrelated apps should skip.


## Package map

| Package | Role |
| --- | --- |
| `@minifactory/config` | Manifest schema, env validation, Next config helper |
| `@minifactory/db` | Shared Prisma client |
| `@minifactory/telegram` | WebApp client helpers + server initData validation |
| `@minifactory/core` | Session, usage, referrals, AppShell, shared routes |
| `@minifactory/ui` | Mobile-first Mini App components |
| `@minifactory/analytics` | First-party event write path |
| `@minifactory/payments` | Stars-oriented purchase models/helpers |
| `@minifactory/ads` | Disabled/mock ad providers |
| `@minifactory/ai` | Server-only generate/analyze/transcribe interfaces |
| `@minifactory/media` | Camera/picker/compression + MIME/size checks |
| `@minifactory/notifications` | Bot API send/webhook helpers |

## Request flow

1. Mini App loads Telegram WebApp script and `AppShell`.
2. Shell POSTs `/api/mf/session` with Telegram initData (or mock header in dev).
3. Core upserts `App`, `User`, `AppUser`, records `app_open` / `first_open`, attributes referrals.
4. Feature routes call `requireIdentity`, `consumeUsage`, and `track`.
5. Admin reads the same Postgres for portfolio totals.
