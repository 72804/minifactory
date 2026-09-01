# Deployment

Each Mini App is an independent Next.js app in this monorepo. Vercel clones the whole repository; **Root Directory** only changes where commands run.

## Proven lifecycle

```text
pnpm create-mini <slug>
→ implement the feature
→ pnpm app:doctor <slug>
→ git commit / push
→ create a Vercel project (Root Directory apps/<slug>)
→ add production env (names only in docs; values stay in Vercel)
→ pnpm db:migrate:deploy when the Prisma schema changed
→ deploy
→ set APP_BASE_URL to the production HTTPS origin
→ pnpm --filter @minifactory/<slug> telegram:setup
→ device test inside Telegram
→ listing assets in apps/<slug>/public/listing/
→ FindMini submission (manual)
```

Do not automate secret creation, `prisma migrate reset`, or other destructive database operations.

## One Vercel project per Mini App

Example: LensMini → Root Directory `apps/lensmini`. QRMini → Root Directory `apps/qrmini`.

### Project settings

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root Directory | `apps/<slug>` (never the repository root) |
| Include source files outside Root Directory | enabled (Vercel default for Git monorepos) |
| Install Command | `cd ../.. && pnpm install` |
| Build Command | `cd ../.. && pnpm exec turbo run build --filter=@minifactory/<slug>` |
| Ignored Build Step | `cd ../.. && npx turbo-ignore @minifactory/<slug>` |
| Output | Next.js default (do not set a custom output directory, never `public`) |
| Node | 20+ |

`turbo-ignore` uses the package dependency graph. A change only under `apps/qrmini` should skip a LensMini deploy. A change in `packages/telegram` (or another workspace dependency of LensMini) should **not** skip LensMini.

Generated apps include `vercel.json` with install, build, and ignore commands. Dashboard overrides beat `vercel.json` if both are set.

Each consumer Mini App must be its own Vercel project so `TELEGRAM_BOT_TOKEN` can differ. Server secrets stay in Vercel env (and in `turbo.json` `tasks.build.env` for hashing/strict mode). Never prefix them with `NEXT_PUBLIC_`.

### Environment variables (per Vercel project)

Required:

- `DATABASE_URL` — pooled **runtime** connection (Neon pooler is fine)
- `TELEGRAM_BOT_TOKEN` (**unique per bot / Mini App**)
- `APP_BASE_URL` (that project's production HTTPS URL)

Optional:

- `DIRECT_URL` — unpooled **migration** connection. Used only by `pnpm db:migrate:deploy`. Not required at Next.js runtime.
- `TELEGRAM_WEBHOOK_SECRET` (unique per bot)
- `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`
- `OPENAI_API_KEY` (required in production when the app has capability `ai`)
- `OPENAI_VISION_MODEL` (LensMini default `gpt-5.6-luna`)
- `BLOB_READ_WRITE_TOKEN`
- `ADS_PROVIDER`

Development-only; set both to `false` in production:

- `ALLOW_TELEGRAM_MOCK`
- `NEXT_PUBLIC_TELEGRAM_MOCK`

Admin project only:

- `ADMIN_SECRET`

Never enable mock Telegram auth in production. Production ignores `ALLOW_TELEGRAM_MOCK` and rejects `tma-mock`. Direct browser visits must not create guest sessions.

## Admin dashboard

Deploy `apps/admin` as a separate Vercel project. Set `ADMIN_SECRET` and `DATABASE_URL`. Do not expose it as a Telegram Mini App.

## Database

One PostgreSQL schema is shared by every Mini App. Prisma lives at the factory root.

| Action | Command | When |
| --- | --- | --- |
| Development | `pnpm db:migrate:dev` | local schema changes |
| Production | `pnpm db:migrate:deploy` | after a migration is committed, **explicitly**, never inside `next build` |
| Never | `prisma migrate reset` | destroys data; not for production |

`DATABASE_URL` is the pooled runtime URL. `DIRECT_URL`, when set, is preferred for `migrate deploy`. If `DIRECT_URL` is unset and `DATABASE_URL` is a Neon `-pooler.` host, the deploy script derives the unpooled host for that process only. Runtime Vercel `DATABASE_URL` stays pooled.

`pnpm db:push` remains for throwaway local prototyping. Do not use it against production.

`prisma generate` runs on install/build. Vercel deploys must not run `migrate dev`, `migrate deploy`, or `db push` as part of the Next.js build.
