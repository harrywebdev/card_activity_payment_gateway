# Card Activity Gateway — Implementation Plan

## Context

Three Czech bank cards (CSOB, AirBank, Raiffeisen) require 5-10 transactions per month each to qualify for bonuses (extra interest, etc.). The goal is to fully automate these transactions so they happen without manual effort.

**Approach:** Run our own payment gateway using **GoPay** as the processor. Each card is saved (tokenized) once with 3DS verification, then charged on a schedule using merchant-initiated transactions (MIT) — no further SCA needed. The money flows to our own merchant account, so we only lose GoPay's commission (~0.95% per tx, no fixed fee). A simple web app manages card enrollment, and a scheduler triggers charges spread naturally across each month.

**Why GoPay:** Lowest cost for micro-transactions (0.95% + 0 CZK fixed), supports ON_DEMAND recurring/MIT, 12 months free on Start plan, Czech-native processor.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Docker Container                │
│                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│  │ Card      │  │ Scheduler │  │ Telegram │  │
│  │ Enrollment│  │ (cron)    │  │ Notifier │  │
│  │ Web UI    │  │           │  │          │  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  │
│       │               │              │        │
│       └───────┬───────┘──────────────┘        │
│               │                               │
│        ┌──────┴──────┐                        │
│        │  GoPay API  │                        │
│        │  Client     │                        │
│        └──────┬──────┘                        │
│               │                               │
│        ┌──────┴──────┐                        │
│        │  SQLite DB  │                        │
│        └─────────────┘                        │
└─────────────────────────────────────────────┘
          │
          ▼
    GoPay Payment Gateway
```

---

## Components

### 1. Card Enrollment Web UI (`src/web/`)
A minimal Express server with a simple HTML page where you:
- Add a card by initiating a GoPay payment (e.g., 1 CZK) with `recurrence.recurrenceCycle: ON_DEMAND`
- GoPay redirects to their hosted payment page → user enters card details → 3DS verification
- On success callback, we store the GoPay payment ID (used as token for future charges)
- One-time setup per card

**Files:** `src/web/server.ts`, `src/web/routes.ts`, `src/web/views/` (simple HTML templates)

### 2. GoPay API Client (`src/gopay/`)
Thin typed wrapper around GoPay's REST API:
- `authenticate()` — OAuth2 token (client_id + client_secret)
- `createPayment(params)` — initial card enrollment payment with ON_DEMAND recurrence
- `createRecurrence(originalPaymentId, amount)` — charge a saved card (MIT, no customer interaction)
- `getPaymentStatus(paymentId)` — check payment result
- `voidRecurrence(paymentId)` — cancel card enrollment

**Files:** `src/gopay/client.ts`, `src/gopay/types.ts`

### 3. Scheduler (`src/scheduler/`)
- **Planner** (`planner.ts`): On the 1st of each month (and on startup if no plan exists), generates a randomized schedule of charges for all enrolled cards. Spreads transactions between day 2-27, random times between 08:00-21:00, with natural spacing.
- **Executor** (`executor.ts`): Runs every 10 minutes via node-cron. Picks up due scheduled payments, calls GoPay `createRecurrence`, records results, sends Telegram notifications.
- **Cron** (`cron.ts`): node-cron setup — executor (every 10 min), planner (1st of month), daily summary, monthly summary.

### 4. Telegram Notifications (`src/telegram/`)
Uses existing bot. Sends:
- Per-transaction confirmations (card, amount, progress X/N)
- Daily summary (progress per card)
- Monthly summary (all cards status)
- Error alerts (failed charges, retries)

**Files:** `src/telegram/notifier.ts`, `src/telegram/templates.ts`

### 5. Database (`src/db/`)
SQLite via Drizzle ORM + better-sqlite3.

**Tables:**
- `cards` — enrolled cards (id, bank_name, last_four, gopay_payment_id, required_tx_per_month, amount_min, amount_max, enabled)
- `monthly_plans` — per card per month goals (card_id, year, month, required_tx, completed_tx, status)
- `scheduled_payments` — individual scheduled charges (plan_id, card_id, amount, scheduled_at, status, attempts)
- `transactions` — execution log (scheduled_payment_id, card_id, amount, status, gopay_payment_id, error, executed_at)

**Files:** `src/db/client.ts`, `src/db/schema.ts`, `drizzle.config.ts`

### 6. Config (`config/config.yaml`)
```yaml
dryRun: false

gopay:
  clientId: "${GOPAY_CLIENT_ID}"
  clientSecret: "${GOPAY_CLIENT_SECRET}"
  merchantId: "${GOPAY_MERCHANT_ID}"
  sandbox: false  # true for testing

schedule:
  startDay: 2
  endDay: 27
  earliestHour: 8
  latestHour: 21
  avoidWeekends: false
  executorIntervalMinutes: 10

telegram:
  botToken: "${TELEGRAM_BOT_TOKEN}"
  chatId: "${TELEGRAM_CHAT_ID}"
  enablePerTransaction: true
  enableDailySummary: true
  dailySummaryHour: 21

web:
  port: 3000  # Card enrollment UI

database:
  path: "./data/gateway.db"
```

Card details (bank name, required tx count, amount ranges) are stored in the DB after enrollment, not in config files.

---

## Project Structure

```
card_activity_gateway/
├── src/
│   ├── index.ts                 # Bootstrap: load config, init DB, start cron, start web
│   ├── config/
│   │   ├── loader.ts            # YAML + env var resolution + Zod validation
│   │   └── schema.ts            # Zod schemas + types
│   ├── db/
│   │   ├── client.ts            # Drizzle + better-sqlite3 init
│   │   └── schema.ts            # Table definitions
│   ├── gopay/
│   │   ├── client.ts            # GoPay REST API wrapper
│   │   └── types.ts             # GoPay API types
│   ├── scheduler/
│   │   ├── planner.ts           # Monthly schedule generation
│   │   ├── executor.ts          # Due payment processing
│   │   └── cron.ts              # node-cron setup
│   ├── telegram/
│   │   ├── notifier.ts          # Telegram Bot API client
│   │   └── templates.ts         # Message formatting
│   ├── web/
│   │   ├── server.ts            # Express app
│   │   └── routes.ts            # Enrollment endpoints
│   └── utils/
│       ├── logger.ts            # Pino logger
│       └── random.ts            # Random amount/time helpers
├── config/
│   └── config.yaml
├── data/                        # SQLite DB (Docker volume)
├── drizzle.config.ts
├── tsconfig.json
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## Implementation Order

### Phase 1: Foundation
1. Project scaffolding — `package.json`, `tsconfig.json`, `.gitignore`, deps
2. Config loader — YAML parsing, `${ENV}` resolution, Zod validation
3. Database — Drizzle schema, client, auto-migration on startup
4. Logger — Pino with basic setup
5. Entry point — `src/index.ts` minimal bootstrap

### Phase 2: GoPay Integration
6. GoPay API client — OAuth2 auth, createPayment, createRecurrence, getStatus
7. Card enrollment web UI — Express server, enrollment flow, GoPay callback handling
8. Test enrollment with GoPay sandbox (1 CZK test charge)

### Phase 3: Scheduler
9. Planner — monthly schedule generation algorithm (spread txs naturally across the month)
10. Executor — process due payments, call GoPay, record results, handle retries (3 attempts with backoff)
11. Cron setup — wire up all scheduled jobs

### Phase 4: Notifications
12. Telegram notifier — per-tx confirmations, daily summary, error alerts
13. Monthly summary

### Phase 5: Docker & Hardening
14. Dockerfile + docker-compose.yml
15. Graceful shutdown, health checks
16. End-to-end test with all 3 cards on GoPay sandbox, then production

---

## Verification Plan

1. **Unit tests**: Planner schedule distribution (correct count, spread, within window)
2. **GoPay sandbox**: Enroll a test card, trigger a recurrence charge, verify it succeeds
3. **Dry-run mode**: Run full cycle with `dryRun: true` — scheduler plans, executor runs but skips actual GoPay calls, Telegram messages fire
4. **Integration test**: Enroll 1 real card, let the scheduler charge it a few times over 2-3 days, verify charges appear on bank statement
5. **Full rollout**: Enroll all 3 cards, monitor first full month

---

## Key Dependencies

```json
{
  "dependencies": {
    "express": "^5",
    "better-sqlite3": "^11",
    "drizzle-orm": "^0.43",
    "node-cron": "^3",
    "pino": "^9",
    "yaml": "^2",
    "zod": "^3"
  },
  "devDependencies": {
    "typescript": "^5.8",
    "drizzle-kit": "^0.31",
    "@types/better-sqlite3": "^7",
    "@types/express": "^5",
    "@types/node-cron": "^3",
    "tsx": "^4"
  }
}
```

No GoPay SDK for Node.js — we write a thin API client directly (their API is simple REST + OAuth2).
