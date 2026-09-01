# Deployment

Each Mini App is an independent Next.js app in this monorepo. Vercel clones the whole repository; **Root Directory** only changes where commands run.

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
| Output | Next.js default (do not set a custom output directory) |
| Node | 20+ |

Generated apps include `vercel.json` with those install/build commands. You can also paste them into the Vercel UI.

Do not set Root Directory to the repository root. The root `pnpm build` script is `turbo build` with no filter, which compiles every Next.js consumer (`template`, `demo`, `admin`, and each Mini App). A LensMini project must use the filtered command above so Turbo only builds `@minifactory/lensmini` and packages it depends on.

If the Vercel UI already has a Build Command override, replace it with the filtered command — dashboard overrides beat `apps/<slug>/vercel.json`.

Each consumer Mini App must be its own Vercel project so `TELEGRAM_BOT_TOKEN` can differ. Server secrets stay in Vercel env (and in `turbo.json` `tasks.build.env` for hashing/strict mode). Never prefix them with `NEXT_PUBLIC_`.

### Environment variables (per Vercel project)

Required:

- `DATABASE_URL` (may be shared Postgres)
- `TELEGRAM_BOT_TOKEN` (**unique per bot / Mini App**)
- `APP_BASE_URL` (that project's production URL)

Optional:

- `TELEGRAM_WEBHOOK_SECRET` (unique per bot)
- `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`
- `OPENAI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `ADS_PROVIDER`

Development-only; set both to `false` in production:

- `ALLOW_TELEGRAM_MOCK`
- `NEXT_PUBLIC_TELEGRAM_MOCK`

Admin project only:

- `ADMIN_SECRET`

Never enable mock Telegram auth in production. Production ignores `ALLOW_TELEGRAM_MOCK` and rejects `tma-mock`.

## Admin dashboard

Deploy `apps/admin` as a separate Vercel project. Set `ADMIN_SECRET` and `DATABASE_URL`. Do not expose it as a Telegram Mini App.

## Database

Run Prisma from the factory root (loads root `.env`):

```bash
pnpm db:push
```

or `pnpm db:migrate` after you introduce migrations.
