# Card Activity Gateway — Implementation Plan

## Context

Three Czech bank cards (CSOB, AirBank, Raiffeisen) require 5-10 transactions per month each to qualify for bonuses (extra interest, etc.). The goal is to fully automate these transactions so they happen without manual effort.

**Approach:** Run our own payment gateway using **GoPay** as the processor. Each card is saved (tokenized) once with 3DS verification, then charged on a schedule using merchant-initiated transactions (MIT) — no further SCA needed. The money flows to our own merchant account, so we only lose GoPay's commission (~0.95% per tx, no fixed fee).

**Brand:** **Kup si Odstín** ("Buy yourself a Shade"). Domain: `kupsiodstin.cz`. Internal codebase name stays `card_activity_gateway` — the brand is the public surface only.

**Product framing — Color Subscriptions:** The system is wrapped in a real-looking storefront where users "claim" a color from a curated catalog by subscribing with a monthly-instalment plan. This is not decoration — it is the actual product surface. Each MIT charge is a real instalment toward a real subscription, so:

- The repeated micro-charges on the cardholder statement look natural ("of course, they signed up for a 10-instalment plan").
- Each GoPay transaction carries realistic order metadata (color name, subscription ID, instalment N/M).
- An auditor browsing the site sees an actual service: catalog, login, dashboard, transaction history.

**Why GoPay:** Lowest cost for micro-transactions (0.95% + 0 CZK fixed), supports ON_DEMAND recurring/MIT, 12 months free on Start plan, Czech-native processor.

**Deployment target:** Disco.cloud — single Docker image, one long-running web service plus Disco's native scheduler invoking the same image with overridden commands for cron jobs.

---

## Product Model

### Color Subscriptions

- **Catalog**: ~1000 curated named colors (seeded from the XKCD color survey or similar public-domain palette). Each color has a hex value, display name, and at most one current owner.
- **One owner per color at a time.** Creates scarcity and makes the "claim" action feel meaningful. When a subscription is cancelled the color becomes claimable again.
- **Subscribe flow**: logged-in user picks an unclaimed color → sets `monthly_amount_czk` (e.g. 100) and `instalments_per_month` (e.g. 10) → confirms → GoPay hosted-page payment for the first instalment (10 CZK) with `recurrence.recurrenceCycle: ON_DEMAND` → 3DS → on success: card token saved, subscription activated, planner schedules the remaining instalments for the current month.
- **First subscription enrols the user's card.** Subsequent subscriptions on the same account reuse the saved payment method silently (no 3DS).
- **Auto-renew**: on the 1st of each month, the planner generates a new schedule of `instalments_per_month` charges of `monthly_amount_czk / instalments_per_month` CZK for every active subscription, spread randomly across days 2-27 between 08:00-21:00.
- **Cancel**: user-initiated from the dashboard; color is returned to the pool at end of current month.

### Auth

- **Email magic-link only** (no passwords). Email submitted → token created → link sent via Resend → click verifies → session cookie issued.
- **Allowlist-gated**: only emails present in the `ALLOWED_EMAILS` env var (comma-separated string) can receive a magic link. Login form behaviour for non-allowlisted emails: **silent success** — show the same "check your inbox" confirmation regardless, but skip token creation and email send. Prevents email-enumeration leakage to anyone poking at the form.
- **Sessions**: stateless, encrypted HTTP-only cookies via iron-session (`{userId, username, issuedAt}` sealed with `COOKIE_SECRET`). 30-day rolling expiry. No DB sessions table. Server-side revocation isn't possible without rotating `COOKIE_SECRET` (which signs everyone out) — acceptable at this scale.
- **Username on first login**: when an allowlisted email completes magic-link verification for the first time, a unique 5-letter pseudo-Czech username is generated and stored on the `users` row.
  - **Shape**: strict `CVCVC` pattern (consonant-vowel-consonant-vowel-consonant). Gives word-like, pronounceable handles instead of random gibberish.
  - **Alphabets** (ASCII only, to keep usernames URL- and identifier-safe):
    - Consonants: `b c d f g h j k l m n p r s t v z`
    - Vowels: `a e i o u y`
  - **Examples**: `karpa`, `lumen`, `vetor`, `nipol`, `dosek`, `runek`.
  - **Search space**: 17 × 6 × 17 × 6 × 17 ≈ 1.77M — ample for the allowlist's scale.
  - **Denylist**: tiny static file `src/auth/username-denylist.ts` to skip unfortunate generations (profanity, slurs). Regenerate on a hit.
  - **Uniqueness**: generate-and-retry against a UNIQUE constraint on `users.username`; cap retries at 10. Once assigned, usernames are immutable.
- **Public display = username only.** Email addresses are never shown in any public page. Owner of a color is displayed as e.g. `karpa`. The signed-in user sees their own username in the dashboard header so they know which identity is theirs.
- **No demo/seed data**: the catalog starts entirely unclaimed. Colors get owners only as the real allowlisted users (you) subscribe to them.

### Pages

- `/` — landing: pitch ("Own a color"), featured colors, CTA to sign up
- `/colors` — catalog grid, claimable vs owned
- `/colors/[hex]` — detail page: large color swatch, hex/RGB/HSL, owner (masked) or Subscribe button, total CZK invested into this color across its lifetime
- `/login` — magic-link request form
- `/auth/verify` — token verification, redirect to dashboard
- `/dashboard` — my subscriptions (color swatches, monthly amount, instalments, status), payment methods
- `/dashboard/subscriptions/[id]` — per-subscription transaction history and instalment schedule
- `/subscribe/[hex]` — plan configuration form → GoPay redirect
- `/healthz` — JSON liveness probe (see below)
- `/api/gopay/callback`, `/api/gopay/notify` — GoPay return URL + webhook
- Boring legal pages: `/terms`, `/privacy`, `/contact` (auditor optics)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                            Disco.cloud                              │
│                                                                      │
│  ┌────────────────────────┐    ┌──────────────────────────────┐    │
│  │  web (long-running)     │    │  Disco-scheduled cron jobs    │    │
│  │  image: default         │    │  image: default               │    │
│  │  Next.js standalone     │    │                               │    │
│  │  - storefront           │◄───┤  execute-due  */10 * * * *    │    │
│  │  - auth (magic link)    │    │  plan-month   0 0 1 * *       │    │
│  │  - dashboard            │    │  daily-sum    0 21 * * *      │    │
│  │  - GoPay callbacks      │    │                               │    │
│  │  - /api/cron/*          │    │  Each cron service runs a     │    │
│  │  - /api/healthz         │    │  shell script that wgets the  │    │
│  └────────────┬───────────┘    │  matching /api/cron/* route   │    │
│               │                 │  with Authorization: Bearer   │    │
│               │                 │  $CRON_SECRET                  │    │
│               │                 └──────────────────────────────┘    │
│               │                                                       │
│               │      ┌────────────────────────────────────┐         │
│               │      │  Deploy hooks (one-shot)            │         │
│               │      │  image: migrator                    │         │
│               │      │  - hook:deploy:start:before →       │         │
│               │      │      prisma migrate deploy          │         │
│               │      │  - hook:deploy:start:after →        │         │
│               │      │      wget to Telegram (deploy ping) │         │
│               │      └────────────────┬───────────────────┘         │
│               │                       │                              │
│               └───────────┬───────────┘                              │
│                           │                                          │
│                  ┌────────┴─────────┐                                │
│                  │ db-data volume    │                                │
│                  │ /app/data         │                                │
│                  │ SQLite (WAL)      │                                │
│                  └───────────────────┘                                │
└────────────────────────────────────────────────────────────────────┘
            │
            ▼
       GoPay API (REST + OAuth2)         Resend (magic-link email)
       Telegram Bot API (notifications + deploy pings)
```

**Cron mechanism:** Disco's native `"type": "cron"` services invoke shell scripts in `scripts/cron-*.sh`. Each script does one thing: `wget` the matching `/api/cron/<name>` route on the internal `http://web:3000` hostname with `Authorization: Bearer $CRON_SECRET`. The real work — Prisma queries, GoPay calls, heartbeat writes — lives in the Next.js API route, sharing the same `src/lib/*` code as the rest of the app. No `node-cron`, no separate CLI binaries, no Prisma client duplicated across containers.

**Migration mechanism:** Disco runs `prisma migrate deploy` from a minimal **migrator image** (`Dockerfile.migrator`) before every deploy via `hook:deploy:start:before`. The web image stays free of migration logic; failed migrations abort the deploy before the new web container ever starts.

---

## Components

### 1. Next.js Web App (`src/app/`, `src/components/`, `src/lib/`)

App Router with Server Components by default. **No Server Actions** — every mutation goes through an explicit `app/api/*/route.ts` POST handler with `<form action="/api/..." method="post">` for progressive enhancement. The rationale:

- Smaller, explicit surface (every mutation has a known URL; greppable + curl-testable).
- Avoids the action-ID enumeration, action-closure-encryption (e.g. CVE-2024-46982 class), and related concerns that come bundled with `"use server"`.
- Consistent with typo_edita's pattern — every mutation in that codebase is a route handler.

Tailwind v4 + shadcn/ui (CSS-variable mode, no `tailwind.config.ts`). Prisma/SQLite access lives in `src/lib/db.ts` and is imported directly from server components and route handlers.

Key flows:
- **Login**: form posts to `/api/auth/request-link` → handler reads FormData, calls `issueMagicLink(email)` (allowlist check inside the lib so it silently no-ops for non-allowlisted addresses), redirects to `/login?sent=1`. UX response is identical whether or not the email is recognised, so the form can't be used for enumeration.
- **Verify**: `/api/auth/verify?token=…` consumes the token (single-use + expiry), find-or-creates the User with a CVCVC username on first verification, sets the iron-session cookie, redirects to `/dashboard`.
- **Logout**: `/api/auth/logout` (POST) destroys the session, redirects to `/`.
- **Subscribe**: form on `/subscribe/[hex]` → posts to `/api/subscriptions/create` → handler creates a pending `Subscription` + `PaymentMethod` (if user has none) → calls `gopay.createPayment({recurrence: ON_DEMAND, amount: instalment_amount, target: subscription_metadata})` → redirects user to GoPay's hosted URL.
- **GoPay callback** (`/api/gopay/callback`): user-facing redirect after 3DS. Reads payment status, shows success/failure page, but does **not** trust this for state changes.
- **GoPay notify** (`/api/gopay/notify`): server-to-server webhook from GoPay. Verifies signature, marks subscription active + payment_method saved + first transaction recorded, triggers planner to fill the rest of the current month.

### 2. GoPay API Client (`src/gopay/`)

Thin typed wrapper around GoPay's REST API:
- `authenticate()` — OAuth2 Client Credentials grant (server-to-server). Caches bearer token until expiry. **This is for our backend talking to GoPay's API — no user involvement.**
- `createPayment(params)` — initial enrolment payment. Sends `recurrence.recurrenceCycle: ON_DEMAND` so the resulting payment ID can be reused as a token. Returns the payment object including `gw_url` (the hosted payment page).
- `createRecurrence(originalPaymentId, amount, orderMeta)` — MIT charge for subsequent instalments. Pure server-to-server, no 3DS.
- `getPaymentStatus(paymentId)` — verification on callbacks and webhook. We always re-fetch via the API instead of trusting the webhook payload at face value.
- `voidRecurrence(paymentId)` — cancel ON_DEMAND token when a subscription is cancelled.

Order metadata for every recurrence call: `order_number = sub_<id>_inst_<n>_of_<m>`, `description = "Color subscription: <name> (#<hex>) — instalment <n>/<m>"`. Makes the GoPay merchant dashboard and bank statements coherent with the storefront.

#### PCI scope & card-data boundary

**We never collect card data on our servers.** Card numbers are entered on GoPay's hosted page (`gate.gopay.cz`) only. This keeps us in **PCI DSS SAQ A** scope — the minimal self-assessment, applicable when all cardholder data functions are fully outsourced to a validated third party. No SAQ A-EP, no SAQ D, no QSA.

The user-facing `return_url` is treated as **untrusted** — it's a browser-driven redirect anyone could forge. State changes (subscription activation, transaction recording) are only ever triggered from the verified `notification_url` webhook + a confirming `getPaymentStatus()` call.

#### Subscribe / enrolment flow (concrete)

```
Browser              kupsiodstin.cz (Next.js)         GoPay API           GoPay hosted page
   │                          │                         │                          │
   │  POST /subscribe/[hex]   │                         │                          │
   │ ───────────────────────► │                         │                          │
   │                          │  authenticate()         │                          │
   │                          │ ──────────────────────► │                          │
   │                          │ ◄ bearer token ──────── │                          │
   │                          │  createPayment({        │                          │
   │                          │   amount, ON_DEMAND,    │                          │
   │                          │   return_url,           │                          │
   │                          │   notification_url })   │                          │
   │                          │ ──────────────────────► │                          │
   │                          │ ◄ payment{id, gw_url}── │                          │
   │ ◄ 307 → gw_url ───────── │                         │                          │
   │ ─────────────────────────────────────────────────────────────────────────────►│
   │                          │                         │           [enter card,   │
   │                          │                         │            3DS verify]   │
   │                          │                         │ ◄──── webhook ────────── │
   │                          │ ◄ POST notification_url │                          │
   │                          │  verify signature       │                          │
   │                          │  getPaymentStatus(id)   │                          │
   │                          │ ──────────────────────► │                          │
   │                          │ ◄ status:PAID ───────── │                          │
   │                          │  activate subscription, │                          │
   │                          │  save payment_method,   │                          │
   │                          │  schedule remaining     │                          │
   │                          │  instalments            │                          │
   │ ◄────── return_url ──────────────────────────────────────────────────────────│
   │ ─ GET return_url ──────► │                         │                          │
   │                          │  (subscription already   │                          │
   │                          │   active from webhook —  │                          │
   │                          │   show success page)     │                          │
   │ ◄ "subscription active" ─│                         │                          │
```

**URLs:**
- `return_url` = `${PUBLIC_URL}/api/gopay/callback?sub=<subscription_id>` — handled by `app/api/gopay/callback/route.ts`. Renders user-facing success/failure UI only; does NOT mutate state.
- `notification_url` = `${PUBLIC_URL}/api/gopay/notify` — handled by `app/api/gopay/notify/route.ts`. The trusted state-mutation path. Verifies the webhook signature, calls `getPaymentStatus()` to confirm, then writes.

#### Recurring (MIT) flow

```
Disco cron (*/10 min) ─► execute-due.js
                            │
                            │  pick due scheduled_payments
                            ▼
                         createRecurrence(originalPaymentId, amount, orderMeta)
                            │
                            │  GoPay charges saved token, no 3DS,
                            │  returns new payment id + status
                            ▼
                         record transactions row,
                         advance subscription_plans counter,
                         send Telegram notification
```

#### Open questions to verify against current GoPay docs at implementation time

- **Webhook signature scheme**: HMAC header, signed JWT, or IP allowlist only? Implement signature verification on `/api/gopay/notify` accordingly.
- **`return_url` query payload**: does GoPay append the payment id automatically, or do we need to encode the subscription id ourselves (which we already do via `?sub=`)?
- **Contact-email constraints**: whether the email on `createPayment` has to match the actual cardholder, or whether mismatch just logs a warning.
- **MIT 3DS exemption boundaries**: confirm the `ON_DEMAND` recurrence flow does not re-trigger SCA after the initial enrolment, including under PSD2 step-up rules (large amounts, unusual patterns).

### 3. Scheduler (Disco cron → shell script → API route)

The scheduling logic lives in normal Next.js API routes under `app/api/cron/*`. Each route shares the same Prisma client and `src/lib/*` modules as the rest of the app, so no logic is duplicated and no separate CLI binaries are built.

**Trigger chain:**

```
Disco cron service ──► scripts/cron-<name>.sh ──► wget http://web:3000/api/cron/<name>
                                                  Authorization: Bearer $CRON_SECRET
                                                       │
                                                       ▼
                                                  API route does the work,
                                                  updates system_heartbeats,
                                                  returns JSON result
```

**Cron services** (all in `disco.json` under `services`):

| Service | Schedule | Script | Endpoint |
|---|---|---|---|
| `executor` | `*/10 * * * *` | `scripts/cron-execute-due.sh` | `POST /api/cron/execute-due` |
| `planner` | `0 0 1 * *` | `scripts/cron-plan-month.sh` | `POST /api/cron/plan-month` |
| `daily-summary` | `0 21 * * *` | `scripts/cron-daily-summary.sh` | `POST /api/cron/daily-summary` |

**Shell script pattern** (matches typo_edita's convention; every script identical except the URL):

```sh
#!/bin/sh
set -e
sleep 2
RESPONSE=$(wget -qO- --post-data= \
  --header="Authorization: Bearer $CRON_SECRET" \
  http://web:3000/api/cron/execute-due)
echo "execute-due: $RESPONSE" >&2
```

`http://web:3000` resolves on Disco's internal network to the `web` service. Scripts run inside the **default image** (which has `scripts/` copied in), but they don't carry any application logic of their own — they're just authenticated HTTP triggers.

**Route handlers** (all share the same auth guard + heartbeat upsert):

- `POST /api/cron/plan-month` — Planner. For each active subscription, generates `instalments_per_month` rows in `scheduled_payments` for the current month at `monthly_amount_czk / instalments_per_month` CZK each, randomly distributed across days 2-27 between 08:00-21:00 with natural spacing. Idempotent (skips if a plan already exists for that subscription + month). Upserts heartbeat `planner`.
- `POST /api/cron/execute-due` — Executor. Picks up `scheduled_payments` where `scheduled_at <= now()` and `status = 'pending'`, calls `gopay.createRecurrence`, records the outcome in `transactions`, advances `subscription_plans.completed_instalments`, sends per-tx Telegram. Retry policy: 3 attempts with exponential backoff (10 min, 1 h, 6 h). Upserts heartbeat `executor` on every run, regardless of whether any payments were due.
- `POST /api/cron/daily-summary` — Aggregates today's per-subscription progress, sends Telegram digest. Upserts heartbeat `daily_summary`.

**Auth guard** (shared helper in `src/lib/cron.ts`):

```ts
export function isAuthorizedCron(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}
```

Every cron route returns 401 on a missing/wrong bearer token. The same `CRON_SECRET` env var is consumed by both the script (header) and the route (validation).

### 4. Healthcheck (`app/api/healthz/route.ts`)

`GET /api/healthz` returns JSON. Logic:

1. SELECT every row from `system_heartbeats` via Prisma.
2. For each job, compute `age = now - last_run_at`.
3. Thresholds: executor 25 min, planner 32 days, daily-summary 25 h.
4. If any job is stale → HTTP 503 with `{status: "unhealthy", jobs: [...]}`.
5. Otherwise HTTP 200 with `{status: "ok", jobs: [...]}`.

This validates:
- Web process is up (the route responds at all).
- SQLite is reachable (the SELECT succeeds).
- The Disco cron services are actually firing — because heartbeats are upserted by the cron API routes themselves, freshness is end-to-end proof that Disco fired the schedule, the script ran, the wget succeeded, and the route executed.

GoPay auth and Telegram delivery are deliberately **not** checked here — transient upstream failures shouldn't page us; the executor's own error handling + Telegram alerts cover those.

Point UptimeRobot / Better Stack at `https://kupsiodstin.cz/api/healthz`.

### 5. Telegram Notifications (`src/lib/telegram.ts`)

Trivial `"server-only"` wrapper around `https://api.telegram.org/bot${token}/sendMessage`. Same shape as the typo_edita helper — one function `sendTelegram(text)`, no-op if env vars are missing.

Used by:
- Cron API routes: per-transaction confirmations, daily summary, monthly recap, error alerts on failed final retries.
- `disco.json` deploy hooks: a direct `wget` to the Telegram API in `hook:deploy:start:after` pings the chat with deploy status (no Next.js involved — runs inside the migrator image after the new web container is healthy).

### 6. Email (`src/lib/email.ts`)

Resend wrapper for magic-link emails. Single template: "Click to sign in to Kup si Odstín" with a 15-min single-use link. Free tier (3k/mo) is overkill for an allowlist of ~5 emails.

### 7. Database — Prisma + better-sqlite3 adapter

**Stack:** Prisma 7 ORM with `@prisma/adapter-better-sqlite3` driver. Schema in `prisma/schema.prisma`, migrations in `prisma/migrations/`, generated client output to `src/generated/prisma/` (gitignored). Client singleton in `src/lib/db.ts` follows the typo_edita pattern (global cache in dev to survive HMR, fresh instance in prod).

**Storage:** SQLite file on a Disco volume mounted at `/app/data` on the web service, all cron services, and the migrator deploy hook. Multi-process writers are safe at our scale; `better-sqlite3` uses WAL by default and the cron API routes (which would be the contention source) all run sequentially via Disco's scheduler.

**Migrations:** never auto-run on web boot. `Dockerfile.migrator` builds a minimal image that has `node_modules` + `prisma/` + the generated client. `disco.json`'s `hook:deploy:start:before` invokes `./node_modules/.bin/prisma migrate deploy` from that image with the volume mounted, before the new web container is started. A failed migration aborts the deploy.

**Models** (Prisma syntax, fleshed out in `prisma/schema.prisma`):

- `User` (id cuid, email UNIQUE, username UNIQUE, createdAt, isAdmin)
- `MagicLinkToken` (token PK, email, expiresAt, usedAt nullable)
- `Color` (id, hex UNIQUE, name, currentSubscriptionId nullable + unique relation to Subscription)
- `PaymentMethod` (id, userId → User, gopayPaymentId, lastFour, bankName, status)
- `Subscription` (id, userId → User, colorId → Color, paymentMethodId → PaymentMethod, monthlyAmountCzk Int, instalmentsPerMonth Int, status [pending|active|cancelled], startedAt nullable, cancelledAt nullable)
- `SubscriptionPlan` (id, subscriptionId → Subscription, year Int, month Int, targetInstalments Int, completedInstalments Int, status; unique on `(subscriptionId, year, month)`)
- `ScheduledPayment` (id, subscriptionPlanId → SubscriptionPlan, amountCzk Int, scheduledAt, status [pending|in_progress|succeeded|failed], attempts Int default 0, lastError nullable)
- `Transaction` (id, scheduledPaymentId → ScheduledPayment, amountCzk Int, status, gopayPaymentId nullable, error nullable, executedAt)
- `SystemHeartbeat` (jobName PK, lastRunAt, lastStatus, lastMessage nullable)

Amounts are stored as integer CZK (e.g. `1000` = 10.00 CZK if we later want hellers; currently we'll work in whole CZK so `100` = 100 CZK). Avoids float drift on instalment rounding.

### 8. Config (`src/lib/config.ts`)

No YAML. A single module reads `process.env` once at boot, validates with Zod 4, and exports a typed `config` object. Tuning knobs that don't realistically vary between environments (schedule window 2-27, hours 8-21, retry policy, healthcheck staleness thresholds) are plain constants in the same file — visible in one place but not pretending to be runtime-configurable.

**Env vars (all required unless noted):**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string, e.g. `file:./data/dev.db` locally, `file:/app/data/gateway.db` in prod |
| `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOPAY_MERCHANT_ID` | GoPay API credentials |
| `GOPAY_SANDBOX` | `"true"` to hit sandbox, default `"false"` |
| `RESEND_API_KEY` | Magic-link email send |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notifications + deploy pings |
| `COOKIE_SECRET` | iron-session encryption key (≥32 bytes) |
| `ALLOWED_EMAILS` | Comma-separated allowlist; normalised to lowercase + trimmed at boot |
| `CRON_SECRET` | Bearer token shared by `scripts/cron-*.sh` and `/api/cron/*` route guards |
| `PUBLIC_URL` / `NEXT_PUBLIC_BASE_URL` | e.g. `https://kupsiodstin.cz`; used in magic-link emails and GoPay return URLs |
| `NEXT_PUBLIC_APP_ENV` | `"development"` / `"production"`; controls Prisma global cache + a few minor UI affordances |
| `DRY_RUN` | `"true"` to skip actual GoPay/email/Telegram sends, default `"false"` |

**Constants in `src/config.ts`** (not env-driven):

- `BRAND_NAME = "Kup si Odstín"`
- `SCHEDULE_START_DAY = 2`, `SCHEDULE_END_DAY = 27`
- `SCHEDULE_EARLIEST_HOUR = 8`, `SCHEDULE_LATEST_HOUR = 21`
- `EXECUTOR_INTERVAL_MINUTES = 10` (must match Disco's cron schedule for the executor)
- `HEALTHCHECK_EXECUTOR_STALE_MINUTES = 25`, `PLANNER_STALE_DAYS = 32`, `DAILY_SUMMARY_STALE_HOURS = 25`
- `MAGIC_LINK_EXPIRY_MINUTES = 15`, `SESSION_DAYS = 30`
- `EXECUTOR_MAX_ATTEMPTS = 3`, retry backoff schedule (10 min, 1 h, 6 h)

Zod parses env at module load and throws on missing/invalid values — fast failure on startup, no defensive runtime checks scattered through the codebase.

Card/payment-method details live in the DB after enrollment, never in config.

---

## Project Structure

```
card_activity_payment_gateway/
├── prisma/
│   ├── schema.prisma             # all models, datasource sqlite
│   └── migrations/               # generated by prisma migrate dev
├── src/
│   ├── app/                      # Next.js App Router (under src/ to match typo_edita)
│   │   ├── (public)/
│   │   │   ├── page.tsx          # Landing
│   │   │   ├── colors/page.tsx
│   │   │   ├── colors/[hex]/page.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── terms/page.tsx
│   │   │   ├── privacy/page.tsx
│   │   │   └── contact/page.tsx
│   │   ├── (auth)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── dashboard/subscriptions/[id]/page.tsx
│   │   │   └── subscribe/[hex]/page.tsx
│   │   ├── api/
│   │   │   ├── auth/verify/route.ts
│   │   │   ├── gopay/callback/route.ts
│   │   │   ├── gopay/notify/route.ts
│   │   │   ├── cron/execute-due/route.ts
│   │   │   ├── cron/plan-month/route.ts
│   │   │   ├── cron/daily-summary/route.ts
│   │   │   └── healthz/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css           # Tailwind v4 @import + @theme
│   ├── components/
│   │   └── ui/                   # shadcn/ui-generated components
│   ├── lib/
│   │   ├── db.ts                 # Prisma singleton w/ better-sqlite3 adapter
│   │   ├── config.ts             # Zod-validated env + product constants
│   │   ├── cron.ts               # isAuthorizedCron + heartbeat helper
│   │   ├── auth.ts               # iron-session helpers, magic-link issue/verify
│   │   ├── email.ts              # Resend wrapper
│   │   ├── telegram.ts           # sendTelegram(text)
│   │   ├── gopay.ts              # OAuth2 + createPayment/createRecurrence/etc.
│   │   ├── planner.ts            # schedule generation
│   │   ├── executor.ts           # due-payment processing
│   │   ├── username.ts           # CVCVC generator + denylist
│   │   ├── colors.ts             # catalogue access helpers
│   │   └── utils.ts              # cn() etc. for shadcn
│   ├── seed/
│   │   ├── colors.json           # XKCD colour list (public domain), committed
│   │   └── seed-colors.ts        # CLI: idempotently insert from colors.json
│   └── generated/                # gitignored — Prisma client output
├── scripts/
│   ├── cron-execute-due.sh
│   ├── cron-plan-month.sh
│   └── cron-daily-summary.sh
├── data/                         # SQLite (Disco volume mount target /app/data)
├── public/                       # static assets
├── components.json               # shadcn config
├── prisma.config.ts              # prisma CLI config, reads DATABASE_URL
├── next.config.ts                # output: "standalone"
├── postcss.config.mjs            # @tailwindcss/postcss
├── tsconfig.json                 # paths: @/* → ./src/*
├── package.json
├── Dockerfile                    # full Next.js standalone build
├── Dockerfile.migrator           # minimal — deps + prisma generate only
├── disco.json                    # web + cron services + deploy hooks
├── .env.example
└── .gitignore
```

---

## Deployment — Disco.cloud

Two Dockerfiles, one `disco.json`. Pattern copied from typo_edita.

### `Dockerfile` — main web image

Multi-stage Node 22-alpine, Next.js standalone. Mirrors typo_edita's main Dockerfile (build secrets via `/run/secrets/.env`, `npm run build` produces `.next/standalone`, scripts directory copied into runner for cron services).

```dockerfile
FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_ENV=production
ARG DISCO_DEPLOYMENT_NUMBER
RUN --mount=type=secret,id=.env \
  env $(cat /run/secrets/.env | xargs) \
  npm run build

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs scripts/ ./scripts/
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### `Dockerfile.migrator` — minimal image for migrations + deploy pings

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
```

No build step. Used for `prisma migrate deploy` (`hook:deploy:start:before`) and the post-deploy Telegram wget (`hook:deploy:start:after`).

### `disco.json`

```json
{
  "version": "1.0",
  "services": {
    "hook:deploy:start:before": {
      "type": "command",
      "image": "migrator",
      "command": "./node_modules/.bin/prisma migrate deploy",
      "volumes": [
        { "name": "db-data", "destinationPath": "/app/data" }
      ]
    },
    "hook:deploy:start:after": {
      "type": "command",
      "image": "migrator",
      "command": "sh -c 'wget -qO- --post-data=\"chat_id=${TELEGRAM_CHAT_ID}&parse_mode=Markdown&text=✅ Deploy %23${DISCO_DEPLOYMENT_NUMBER} to *${DISCO_PROJECT_NAME}* succeeded (${DISCO_COMMIT})\" \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage\" || true'"
    },
    "web": {
      "port": 3000,
      "volumes": [
        { "name": "db-data", "destinationPath": "/app/data" }
      ]
    },
    "executor": {
      "type": "cron",
      "schedule": "*/10 * * * *",
      "command": "./scripts/cron-execute-due.sh"
    },
    "planner": {
      "type": "cron",
      "schedule": "0 0 1 * *",
      "command": "./scripts/cron-plan-month.sh"
    },
    "daily-summary": {
      "type": "cron",
      "schedule": "0 21 * * *",
      "command": "./scripts/cron-daily-summary.sh"
    }
  },
  "images": {
    "default": { "dockerfile": "Dockerfile" },
    "migrator": { "dockerfile": "Dockerfile.migrator" }
  }
}
```

Cron services use the `default` image (which has `scripts/` copied in), so they share Node/binary deps with the web service. They don't need the database volume mounted — they only `wget` to the web service, which holds the volume.

### Volumes & multi-container access

- The `db-data` named volume is mounted at `/app/data` on the **web** service and on both **deploy hooks** (migrator image).
- Cron services do not mount the volume — the database is only accessed by the web service via `wget`-triggered API routes.
- This eliminates the "multiple processes writing to SQLite" concern entirely. Only one process (the Next.js web server) ever opens the DB.

---

## Implementation Order

### Phase 1: Foundation
1. **Project scaffolding** — `package.json` (Next 16 / React 19 / Prisma 7 / Tailwind 4 / Zod 4 / iron-session / Resend / `server-only`), `tsconfig.json` (`@/*` → `./src/*`), `next.config.ts` (`output: "standalone"`), `postcss.config.mjs`, `.gitignore`, `eslint.config.mjs`
2. **shadcn/ui** — `components.json` configured for Tailwind v4, `src/lib/utils.ts` (`cn` helper), `src/app/globals.css` with `@import "tailwindcss"` + `@theme` block + shadcn CSS variables
3. **Prisma** — `prisma/schema.prisma` with all 9 models, `prisma.config.ts`, `src/lib/db.ts` (singleton + better-sqlite3 adapter, dev global cache), first migration via `prisma migrate dev --name init`
4. **Config** — `src/lib/config.ts` reads `process.env`, validates with Zod 4 at module load, exports typed `config` + product constants
5. **Color catalogue seed** — fetch XKCD public-domain colour list (one-time, via `curl`), commit as `src/seed/colors.json`; `src/seed/seed-colors.ts` idempotently upserts via Prisma; `npm run seed:colors` wires it up
6. **Telegram + email stubs** — `src/lib/telegram.ts`, `src/lib/email.ts` with `"server-only"` import; ready for later phases
7. **Skeleton pages** — `src/app/layout.tsx` (root layout with brand header), `src/app/(public)/page.tsx` (placeholder landing), confirm `npm run dev` boots

### Phase 2: Auth + Shop UI
8. Magic-link auth — Resend integration, `ALLOWED_EMAILS` allowlist with silent-success on miss, `MagicLinkToken` lifecycle, iron-session cookie issue/verify, CVCVC username generation on first successful verification (`src/lib/username.ts`)
9. Color catalog + detail pages (read-only, owner shown as username)
10. Dashboard skeleton (empty states)

### Phase 3: GoPay + Subscribe Flow
11. GoPay API client (`src/lib/gopay.ts`) — OAuth2 auth, createPayment, createRecurrence, getPaymentStatus, voidRecurrence
12. Subscribe flow — plan-configuration form, Server Action creates `pending` Subscription + PaymentMethod + first GoPay payment, redirect to hosted page
13. GoPay callback + webhook handlers (`/api/gopay/callback`, `/api/gopay/notify`) — verify signature, re-fetch status, activate subscription, record first transaction
14. End-to-end test on GoPay sandbox

### Phase 4: Scheduler
15. Planner route (`/api/cron/plan-month`) — per-active-subscription monthly schedule generation with random distribution
16. Executor route (`/api/cron/execute-due`) — process due payments, retry policy, transaction recording, heartbeat writes
17. Daily-summary route (`/api/cron/daily-summary`) — aggregate today's progress, Telegram digest
18. Healthcheck route (`/api/healthz`) reading `SystemHeartbeat`
19. Shell scripts (`scripts/cron-*.sh`) following the wget pattern

### Phase 5: Notifications
20. Telegram message templates — per-tx, daily summary, monthly recap, error alerts

### Phase 6: Deployment
21. `Dockerfile` (main, Next.js standalone) + `Dockerfile.migrator`
22. `disco.json` (web + 3 cron services + 2 deploy hooks + 2 images)
23. Disco project setup: secrets (env vars), `db-data` volume, domain attached to `web`
24. Point UptimeRobot at `/api/healthz`
25. End-to-end on sandbox, then production rollout — subscribe all 3 cards, monitor first full month

---

## Verification Plan

1. **Unit tests**: planner distribution (correct count, spread, within window), instalment-amount rounding (sum equals `monthly_amount_czk`).
2. **Auth tests**: magic-link token single-use, expiry enforcement, session cookie validation, allowlist behaviour (allowed email gets a token + email, non-allowlisted email gets the same UI response but no token row and no email send), username generation produces a unique 5-letter string and is stable across subsequent logins for the same email.
3. **GoPay sandbox**: full subscribe → 3DS → callback → first transaction → MIT recurrence on day N.
4. **Dry-run mode**: full cycle with `dryRun: true` — scheduler plans, executor runs but skips actual GoPay calls, Telegram + Resend emails fire (to a sink address).
5. **Healthcheck drills**: stop the Disco executor job, confirm `/healthz` flips to 503 within `executorStaleMinutes`; restart, confirm recovery.
6. **Integration test**: enroll 1 real card via the live subscribe flow, let scheduler charge it a few times across 2-3 days, verify on bank statement.
7. **Full rollout**: subscribe all 3 cards to 3 colors, monitor first full month, validate bank-bonus eligibility hit.

---

## Key Dependencies

Versions match the typo_edita reference project so we benefit from the same tested compatibility matrix.

```json
{
  "dependencies": {
    "next": "16.2.4",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "prisma": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "better-sqlite3": "^12.9.0",
    "@types/better-sqlite3": "^7.6.13",
    "iron-session": "^8",
    "resend": "^6.12.2",
    "server-only": "^0.0.1",
    "zod": "^4.4.1",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "lucide-react": "^0.4"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "16.2.4"
  }
}
```

shadcn/ui components are generated into `src/components/ui/` via the CLI, not installed as a package — Tailwind v4 mode uses CSS variables defined in `src/app/globals.css` rather than a `tailwind.config.ts`. No GoPay SDK exists for Node.js — we write the API client directly (their API is straightforward REST + OAuth2). No `node-cron`, no `pino` (using `console` for now, Sentry can be added later following the typo_edita pattern), no Drizzle.
