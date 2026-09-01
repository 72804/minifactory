# Capabilities

Manifest `capabilities` are not decorative. AppShell and core check them. They are also not a compiler: an app can still import a package it did not declare, so treat the flag as product policy plus factory defaults.

| Capability | Status | Behavior |
| --- | --- | --- |
| `telegramAuth` | implemented | Session and identity routes validate Telegram initData (or explicit dev mock). |
| `database` | implemented | Shared Prisma models; first session upserts `App` / `User` / `AppUser`. |
| `referrals` | implemented | `startapp=ref_*` attribution; share links include a referral param only when enabled. |
| `payments` | partial | Models + `confirmPayment`. Paywall chrome is hidden unless this flag or `monetization.enabled` is set. Stars invoice/webhook grant is not finished. |
| `ads` | partial | `disabled` / `mock` providers exist. No real network. AppShell does not load ads unless the app calls the ads package. |
| `ai` | interface | Server-only `generateText` / `analyzeImage` / etc. Keys never go to the browser. |
| `camera` | interface | Helpers in `@minifactory/media`. AppShell does **not** start the camera. |
| `imageUpload` | interface | Picker + MIME/size checks. |
| `fileUpload` | interface | Same as uploads; no processing pipeline. |
| `audio` | interface | Types and limits only. |
| `notifications` | interface | Bot API send/webhook helpers. |

Status meanings:

- **implemented** — factory enforces or provides the behavior
- **partial** — safe to import, not a complete product
- **interface** — typed hooks for a future app; do not treat as shipped functionality
