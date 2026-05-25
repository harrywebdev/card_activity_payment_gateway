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
┌──────────────────────────────────────────────────────────┐
│                    Disco.cloud                            │
│                                                            │
│  ┌──────────────────────┐    ┌──────────────────────┐    │
│  │  Web service          │    │  Scheduled jobs       │    │
│  │  (long-running)       │    │  (one-shot, same      │    │
│  │  Next.js App Router   │    │   image, overridden   │    │
│  │  - storefront         │    │   CMD)                │    │
│  │  - auth (magic link)  │    │  - execute-due        │    │
│  │  - dashboard          │    │    (*/10 * * * *)     │    │
│  │  - GoPay callbacks    │    │  - plan-month         │    │
│  │  - /healthz           │    │    (0 0 1 * *)        │    │
│  └──────────┬───────────┘    │  - daily-summary      │    │
│             │                 │    (0 21 * * *)       │    │
│             │                 └──────────┬───────────┘    │
│             │                            │                 │
│             └────────────┬───────────────┘                 │
│                          │                                  │
│                ┌─────────┴─────────┐                       │
│                │   /data volume     │                       │
│                │   SQLite (WAL)     │                       │
│                └────────────────────┘                       │
└──────────────────────────────────────────────────────────┘
            │
            ▼
       GoPay API (REST + OAuth2)         Resend (magic-link email)
       Telegram Bot API (notifications)
```

`node-cron` is **not** used. Cron timing is owned by Disco's scheduler; each scheduled job is a short-lived invocation of the same image with `CMD` overridden to a CLI entry point. This keeps the web service stateless w.r.t. timing and lets the healthcheck observe cron via heartbeat rows.

---

## Components

### 1. Next.js Web App (`app/`, `components/`, `lib/`)

App Router with Server Components by default, Server Actions for mutations. Tailwind + shadcn/ui for the design system. Drizzle/SQLite access lives in `src/db` and is imported directly from server components and route handlers.

Key flows:
- **Login**: form posts email → Server Action creates token row → Resend sends link → `/auth/verify?token=…` route consumes token, sets session cookie.
- **Subscribe**: form on `/subscribe/[hex]` → Server Action creates a pending `subscription` + `payment_method` (if user has none) → calls `gopay.createPayment({recurrence: ON_DEMAND, amount: instalment_amount, target: subscription_metadata})` → redirects user to GoPay's hosted URL.
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

### 3. Scheduler (`src/scheduler/` + `src/cli/`)

- **Planner** (`planner.ts`): for each active subscription, generates `instalments_per_month` rows in `scheduled_payments` for the current month at `monthly_amount_czk / instalments_per_month` CZK each, randomly distributed across days 2-27 between 08:00-21:00 with natural spacing. Idempotent (skip if a plan already exists for that subscription + month).
- **Executor** (`executor.ts`): picks up `scheduled_payments` rows where `scheduled_at <= now()` and `status = 'pending'`, calls `gopay.createRecurrence`, records the outcome in `transactions`, advances `subscription_plans.completed_instalments`, sends a Telegram notification. Retry policy: 3 attempts with exponential backoff (10 min, 1 h, 6 h). Writes heartbeat row on every run regardless of whether any payments were due.
- **CLI entry points** in `src/cli/`:
  - `execute-due.ts` — invoked by Disco every 10 min
  - `plan-month.ts` — invoked by Disco at `0 0 1 * *`; also runs once on web-app boot as a safety net for cold starts in the middle of a month
  - `daily-summary.ts` — invoked by Disco at `0 21 * * *`

Each CLI entry imports config + DB, runs one pass, exits. Process lifetime measured in seconds; failures bubble up as non-zero exit code so Disco surfaces them.

### 4. Healthcheck (`app/api/healthz/route.ts`)

`GET /healthz` returns JSON. Logic:

1. SELECT every row from `system_heartbeats`.
2. For each job, compute `age = now - last_run_at`.
3. Thresholds: executor 25 min, planner 32 days, daily-summary 25 h.
4. If any job is stale → HTTP 503 with `{status: "unhealthy", jobs: [...]}`.
5. Otherwise HTTP 200 with `{status: "ok", jobs: [...]}`.

This validates:
- Web process is up (the route responds at all).
- SQLite is reachable and not locked (the SELECT succeeds).
- The Disco scheduler is actually firing the executor (heartbeat is fresh).
- The shared volume mount works (web sees writes from the scheduled job container).

GoPay auth and Telegram delivery are deliberately **not** checked here — transient upstream failures shouldn't page us; the executor's own error handling + Telegram alerts cover those.

Point UptimeRobot / Better Stack at `https://<domain>/healthz`.

### 5. Telegram Notifications (`src/telegram/`)

Existing bot. Sends:
- Per-transaction confirmations (subscription name, amount, instalment N/M)
- Daily summary at 21:00 (per-subscription progress)
- Monthly summary on the 1st (last month results)
- Error alerts (failed charges after final retry, GoPay auth failures, planner failures)

### 6. Email (`src/email/`)

Resend wrapper for magic-link emails. Single template: "Click to sign in to <site>" with a 15-min single-use link. Free tier (3k/mo) is overkill.

### 7. Database (`src/db/`)

SQLite via Drizzle ORM + better-sqlite3 in **WAL mode** with `busy_timeout = 5000ms`. The DB file lives on a Disco volume mounted at `/data` on both the web service and the scheduled-job containers. Multi-process writers are safe at our scale (a few writes per minute at peak).

**Tables:**
- `users` (id, email UNIQUE, username UNIQUE, created_at, is_admin)
- `magic_link_tokens` (token PK, email, expires_at, used_at)
- `colors` (id, hex UNIQUE, name, current_subscription_id NULLABLE)
- `payment_methods` (id, user_id, gopay_payment_id, last_four, bank_name, status)
- `subscriptions` (id, user_id, color_id, payment_method_id, monthly_amount_czk, instalments_per_month, status [pending|active|cancelled], started_at, cancelled_at)
- `subscription_plans` (id, subscription_id, year, month, target_instalments, completed_instalments, status) — one row per subscription per month
- `scheduled_payments` (id, subscription_plan_id, amount_czk, scheduled_at, status [pending|in_progress|succeeded|failed], attempts, last_error)
- `transactions` (id, scheduled_payment_id, amount_czk, status, gopay_payment_id, error, executed_at)
- `system_heartbeats` (job_name PK, last_run_at, last_status, last_message)

### 8. Config (`src/config.ts`)

No YAML. A single module reads `process.env` once at boot, validates with Zod, and exports a typed `config` object. Tuning knobs that don't realistically vary between environments (schedule window 2-27, hours 8-21, retry policy, healthcheck staleness thresholds) are plain constants in the same file — visible in one place but not pretending to be runtime-configurable.

**Env vars (all required unless noted):**

| Var | Purpose |
|---|---|
| `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOPAY_MERCHANT_ID` | GoPay API credentials |
| `GOPAY_SANDBOX` | `"true"` to hit sandbox, default `"false"` |
| `RESEND_API_KEY` | Magic-link email send |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notifications |
| `COOKIE_SECRET` | iron-session encryption key (≥32 bytes) |
| `ALLOWED_EMAILS` | Comma-separated allowlist; normalised to lowercase + trimmed at boot |
| `PUBLIC_URL` | e.g. `https://kupsiodstin.cz`; used in magic-link emails and GoPay return URLs |
| `DATABASE_PATH` | Defaults to `/data/gateway.db` |
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
card_activity_gateway/
├── app/                          # Next.js App Router
│   ├── (public)/
│   │   ├── page.tsx              # Landing
│   │   ├── colors/page.tsx       # Catalog
│   │   ├── colors/[hex]/page.tsx # Color detail
│   │   ├── login/page.tsx        # Magic-link request
│   │   ├── terms/page.tsx
│   │   ├── privacy/page.tsx
│   │   └── contact/page.tsx
│   ├── (auth)/
│   │   ├── dashboard/page.tsx
│   │   ├── dashboard/subscriptions/[id]/page.tsx
│   │   └── subscribe/[hex]/page.tsx
│   ├── api/
│   │   ├── auth/verify/route.ts
│   │   ├── gopay/callback/route.ts
│   │   ├── gopay/notify/route.ts
│   │   └── healthz/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── ui/                       # shadcn/ui-generated
├── lib/                          # shadcn/ui utilities
├── src/
│   ├── config.ts                 # env parsing + product constants
│   ├── db/{client,schema}.ts
│   ├── gopay/{client,types}.ts
│   ├── auth/{magic-link,session}.ts
│   ├── email/resend.ts
│   ├── scheduler/{planner,executor,heartbeat}.ts
│   ├── telegram/{notifier,templates}.ts
│   ├── cli/                      # Disco-scheduled entry points
│   │   ├── execute-due.ts
│   │   ├── plan-month.ts
│   │   └── daily-summary.ts
│   ├── seed/colors.ts            # one-time catalogue import only
│   └── utils/{logger,random}.ts
├── data/                         # SQLite (Disco volume mount target)
├── drizzle.config.ts
├── next.config.mjs               # output: "standalone"
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
├── .env.example
└── .gitignore
```

---

## Deployment — Disco.cloud

### Dockerfile (sketch)

Multi-stage, Node 20-alpine, non-root, `tini` as PID 1, Next.js `output: "standalone"` for a slim runtime image. The CLI scripts are compiled to `dist/cli/*.js` so they can be invoked without the Next.js server.

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build           # next build (standalone) + tsc for src/cli/*

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini \
 && addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist/cli ./dist/cli
COPY --from=build --chown=app:app /app/config ./config
USER app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]    # Next.js standalone entry
```

### Disco orchestration intent

Single image, two roles:

**1. Web service (long-running)**
- Image: built from this repo's Dockerfile
- Command: default (`node server.js`)
- Port: 3000, mapped to public domain
- Volume: `data` → `/data` (read-write)
- Env: `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOPAY_MERCHANT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `COOKIE_SECRET`, `ALLOWED_EMAILS`

**2. Scheduled jobs (one-shot, same image, command overridden)**

| Schedule (cron) | Command |
|---|---|
| `*/10 * * * *` | `node dist/cli/execute-due.js` |
| `0 0 1 * *` | `node dist/cli/plan-month.js` |
| `0 21 * * *` | `node dist/cli/daily-summary.js` |

Each scheduled job must mount the same `data` volume at `/data` and receive the same env vars as the web service so the GoPay client and Telegram notifier can authenticate.

**Schema field names are not pinned here** — fill the exact `disco.json` keys from current Disco docs when wiring it up. The intent above is the contract we need Disco to honour.

### SQLite + multiple containers

The web container and each scheduled-job invocation may write concurrently. Mitigation:
- Open the DB in **WAL mode** (`PRAGMA journal_mode=WAL`).
- Set `PRAGMA busy_timeout=5000`.
- All write transactions are short and scoped (no long-held write locks).

Write volume is < 1 row/s peak, so contention is a non-issue at this scale.

---

## Implementation Order

### Phase 1: Foundation
1. Project scaffolding — `package.json`, `tsconfig.json`, Next.js init, Tailwind + shadcn/ui init, `.gitignore`
2. Config loader — `src/config.ts` reads `process.env`, validates with Zod at module load, exports typed `config` + product constants
3. Database — Drizzle schema (all tables), client, auto-migration on startup, WAL mode
4. Logger — Pino with basic setup
5. Color catalogue seed — import ~1000 named colors from public-domain palette

### Phase 2: Auth + Shop UI
6. Magic-link auth — Resend integration, `ALLOWED_EMAILS` allowlist check with silent-success on miss, token table, verify route, session cookies, username generation on first successful verification
7. Color catalog + detail pages (read-only, no subscribe yet)
8. Dashboard skeleton (empty states)

### Phase 3: GoPay + Subscribe Flow
10. GoPay API client — OAuth2 auth, createPayment, createRecurrence, getPaymentStatus, voidRecurrence
11. Subscribe flow — plan configuration form, Server Action that creates `pending` subscription + payment_method + first GoPay payment, redirect to hosted page
12. GoPay callback + webhook handlers — verify, activate subscription, record first transaction
13. Test enrollment with GoPay sandbox

### Phase 4: Scheduler
14. Planner — generate per-subscription monthly schedules with random distribution
15. Executor — process due payments, retry policy, transaction recording, heartbeat writes
16. CLI entry points — `execute-due`, `plan-month`, `daily-summary`
17. `/healthz` route reading `system_heartbeats`

### Phase 5: Notifications
18. Telegram notifier — per-tx, daily summary, monthly summary, error alerts

### Phase 6: Deployment
19. Dockerfile (multi-stage, standalone)
20. Disco config: web service + 3 scheduled jobs + `data` volume + domain + env secrets
21. Point UptimeRobot at `/healthz`
22. End-to-end test on GoPay sandbox: enroll 1 card, run for 2-3 days, verify charges land
23. Production rollout — enroll all 3 cards, monitor first full month

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

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "better-sqlite3": "^11",
    "drizzle-orm": "^0.43",
    "pino": "^9",
    "yaml": "^2",
    "zod": "^3",
    "resend": "^4",
    "iron-session": "^8",
    "tailwindcss": "^3",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "lucide-react": "^0.4"
  },
  "devDependencies": {
    "typescript": "^5.8",
    "drizzle-kit": "^0.31",
    "@types/better-sqlite3": "^7",
    "@types/react": "^19",
    "tsx": "^4"
  }
}
```

shadcn/ui components are generated into `components/ui/` via the CLI, not installed as a package. No GoPay SDK exists for Node.js — we write the API client directly (their API is straightforward REST + OAuth2). `node-cron` is removed; cron timing is Disco's responsibility.
