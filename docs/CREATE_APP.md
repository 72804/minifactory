# Create a Mini App

```bash
pnpm create-mini <slug>
```

Non-interactive example:

```bash
pnpm create-mini qrmini \
  --yes \
  --name "QR Mini" \
  --description "Generate QR codes inside Telegram" \
  --accent "#0ea5e9" \
  --capabilities telegramAuth,database,referrals
```

**New app = feature slice + config, not an infrastructure rebuild.**

The CLI copies a thin Next.js bootstrap from `apps/template`, writes `app.config.ts`, and points the app at `@minifactory/*` packages. It does not copy Telegram HMAC validation, Prisma, usage, analytics, ads/AI/payment providers, or AppShell implementations.

## Files you typically change

After `pnpm create-mini myapp`:

```
apps/myapp/
  app.config.ts              # name, bot, theme, capabilities, limits, listing
  app/page.tsx               # home screen
  app/process-tool.tsx       # replace with the real UI (or delete)
  app/api/<feature>/route.ts # replace the demo process route
  public/logo.svg
  public/listing/            # FindMini icon + screenshots later
  .env.local                 # copied from .env.example; set this app's bot token
```

Bootstrap files (`next.config.ts`, `layout.tsx`, `app/api/mf/*`, `eslint.config.mjs`) stay as thin re-exports. Do not duplicate auth or database code there.

Then:

```bash
cp apps/myapp/.env.example apps/myapp/.env.local
pnpm --filter @minifactory/myapp dev
```

Set `TELEGRAM_BOT_TOKEN` per bot. Production apps must not share a live token.

## Launch sequence

```bash
pnpm create-mini <slug>
# implement the Mini App
pnpm app:doctor <slug>
git add … && git commit && git push
```

Then in Vercel: new project, Root Directory `apps/<slug>`, production env, deploy. If Prisma migrations changed, run `pnpm db:migrate:deploy` against production **once** (uses `DIRECT_URL` when set). Set `APP_BASE_URL`, run `telegram:setup`, test on a phone inside Telegram, add listing screenshots, submit FindMini manually.

See [DEPLOYMENT.md](./DEPLOYMENT.md).


## What is copied vs imported

Roughly **20–25 small files (~400–600 lines)** are generated, mostly Next/ESLint bootstrap plus the demo process screen. The production behavior lives in `packages/*` (thousands of lines, imported).

## 5-minute utility (QR generator)

Change:

- `app.config.ts` — name, listing, maybe `freePerDay`
- `app/page.tsx` — input + QR canvas
- `app/api/qr/route.ts` — `requireIdentity` + `consumeUsage` + return payload

Inherits: Telegram auth, AppShell, usage, analytics, UI, Vercel bootstrap.

## AI utility (image analyzer)

Add capability `ai` (and `imageUpload` if needed). Keep `OPENAI_API_KEY` on the server.

Change:

- `app/api/analyze/route.ts` — `requireIdentity`, `consumeUsage`, `analyzeImage()` from `@minifactory/ai/server`

Inherits: media MIME/size helpers, AI provider interface, usage, analytics, auth.

## Camera utility (LensMini)

Add capabilities `camera`, `ai`, `imageUpload`. Do not initialize the camera in shared AppShell; start it from the LensMini screen via `@minifactory/media`.

Change:

- camera UI
- `app/api/translate/route.ts` — server-side image analysis only

Inherits: auth, usage, analytics, theme, payments/ads interfaces when you enable those capabilities.

## Capabilities

See [CAPABILITIES.md](./CAPABILITIES.md). Unselected capabilities should not turn on payment UI or referral codes. Interface-only capabilities are not production features until you wire them in the app.

## Invalid generator input

Uppercase slugs, spaces, path traversal, empty names, malformed accents, unknown capabilities, and existing folders fail with a readable error. `--force` is required to overwrite.
