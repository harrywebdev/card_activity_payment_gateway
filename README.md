# Kup si Odstín

Self-hosted payment gateway that automates the minimum card transactions required to qualify for Czech bank bonuses (extra interest, cashback, etc.). Wrapped in a real storefront — `kupsiodstin.cz` — where users claim a color from a curated catalogue via a monthly-instalment subscription.

Internal codebase name: `card_activity_gateway`. Public brand: **Kup si Odstín**.

## Problem

Several Czech banks (CSOB, AirBank, Raiffeisen) offer bonus perks on debit/credit cards — but only if you make a minimum number of transactions per month (typically 5-10). Doing this manually is tedious and easy to forget.

## Solution

A payment gateway charging your own cards on a schedule. The money goes to your own merchant account, so you only lose the payment processor's commission. To make the charging pattern look natural to anyone auditing the merchant (cards on file with realistic order metadata; instalment-shaped recurring micro-charges), it's framed as a real product: subscribe to "own" a color from the catalogue, paid off in monthly instalments. Each MIT charge is a genuine instalment toward a genuine (if niche) subscription.

**How it works:**

1. **Sign in with magic link** (allowlisted emails only). On first login you're assigned a pseudo-Czech 5-letter username (e.g. `karpa`) — your public identity on color owner pages.
2. **Claim a color** — pick an unclaimed hex from the catalogue, choose `monthly_amount_czk` and `instalments_per_month` (e.g. 100 CZK / month in 10 instalments). One owner per color.
3. **One-time card enrolment** — the first instalment runs through GoPay's hosted page with `ON_DEMAND` recurrence + 3DS. Card token saved.
4. **Automatic scheduling** — on the 1st of each month, the planner generates a randomized schedule of charges across days 2-27, between 08:00-21:00, for every active subscription.
5. **Charges run unattended** — Disco's scheduler triggers the executor every 10 min; merchant-initiated transactions hit GoPay against saved tokens. No further 3DS/SCA after enrolment.
6. **Telegram notifications** — per-transaction confirmations, daily progress summaries, monthly recap, error alerts.

## Why GoPay

Comparison for micro-transactions in CZK:

| Processor | Per-tx fee | Monthly fee | Cost on 20 CZK tx |
|-----------|-----------|-------------|-------------------|
| Stripe | 1.5% + 6.50 CZK | 0 CZK | 6.80 CZK (34%) |
| Comgate | 1% + 0 CZK | 100 CZK | 0.20 CZK (1%) |
| **GoPay** | **0.95% + 0 CZK** | **80 CZK** | **0.19 CZK (0.95%)** |

GoPay wins: no fixed per-transaction fee (critical for small amounts), lowest percentage rate, ON_DEMAND recurring payment support, and 12 months free on the Start plan.

## Tech Stack

- **TypeScript / Next.js 16** (App Router, server components, server actions)
- **Tailwind CSS v4 + shadcn/ui** — design system
- **iron-session** — stateless encrypted-cookie auth, no sessions table
- **Resend** — magic-link emails
- **GoPay** — payment processing (REST API, OAuth2, ON_DEMAND recurrence)
- **SQLite** via Prisma 7 + `@prisma/adapter-better-sqlite3`; migrations via `prisma migrate deploy` in a dedicated migrator container on every deploy
- **Disco.cloud** — Docker deployment with two images (main + migrator) and native cron scheduler
- **Telegram Bot API** — notifications + deploy pings

## Setup

```bash
cp .env.example .env
# Fill in GoPay credentials, Resend key, Telegram bot token, allowlisted emails, etc.
# Generate COOKIE_SECRET with: openssl rand -base64 48

npm install
npm run dev
```

See [.env.example](.env.example) for the full list of required environment variables, and [.claude/plans/implementation-plan.md](.claude/plans/implementation-plan.md) for the architecture, schema, and Disco deployment intent.

## Deployment (Disco.cloud)

Architecture: two Dockerfiles, single `disco.json`.

- `Dockerfile` — full Next.js standalone build. Builds with `--mount=type=secret,id=.env` so Disco's runtime env (containing `DATABASE_URL`, `COOKIE_SECRET`, `ALLOWED_EMAILS`, etc.) is available for the `next build` pass that touches `src/lib/config.ts`.
- `Dockerfile.migrator` — minimal: `npm ci --ignore-scripts` + `npx prisma generate`. Used by the two deploy hooks below.

What `disco.json` declares:

- **`web`** — long-running Next.js standalone, port 3000, `db-data` volume mounted at `/app/data`. Default image.
- **`hook:deploy:start:before`** — runs `./node_modules/.bin/prisma migrate deploy` from the migrator image with the `db-data` volume mounted. If migrations fail the deploy aborts before the new web container starts.
- **`hook:deploy:start:after`** — wgets the Telegram bot API to post a "Deploy succeeded" notification.
- **`executor`** — `"type": "cron"`, schedule `*/10 * * * *`, runs `scripts/cron-execute-due.sh` in the default image, which `wget`s `http://web:3000/api/cron/execute-due` with `Authorization: Bearer $CRON_SECRET`.
- **`planner`** — same shape, schedule `0 0 1 * *`, runs `cron-plan-month.sh`.
- **`daily-summary`** — same shape, schedule `0 21 * * *`, runs `cron-daily-summary.sh`. (The daily-summary route additionally emits a Monthly Recap to Telegram when it runs on the 1st of the month.)

### First-time setup steps (on Disco)

1. **Create the Disco project** pointing at this repo.
2. **Create the `db-data` volume.** The hook and the web service both mount it at `/app/data`.
3. **Set environment variables** (Disco env / secrets — see `.env.example` for the full list with comments):

   | Var | Where to get it |
   |---|---|
   | `DATABASE_URL` | Set to `file:/app/data/gateway.db` |
   | `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOPAY_MERCHANT_ID` | GoPay merchant dashboard → API keys |
   | `GOPAY_SANDBOX` | `false` for production, `true` for sandbox |
   | `ALLOWED_EMAILS` | Comma-separated list of emails permitted to sign in |
   | `COOKIE_SECRET` | `openssl rand -base64 48` |
   | `CRON_SECRET` | `openssl rand -base64 32` |
   | `RESEND_API_KEY` | resend.com dashboard |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | @BotFather and getUpdates |
   | `NEXT_PUBLIC_BASE_URL` | `https://kupsiodstin.cz` |
   | `NEXT_PUBLIC_APP_ENV` | `production` |
   | `DRY_RUN` | `false` for production (`true` skips GoPay/Resend/Telegram sends) |

4. **Attach the domain** `kupsiodstin.cz` to the `web` service. Disco handles the certificate via Let's Encrypt.
5. **Deploy.** The first deploy will create the SQLite DB on the volume via `prisma migrate deploy`.
6. **Seed the colour catalogue** (one-shot, idempotent — safe to re-run):

   ```sh
   curl -sS -X POST \
     -H "Authorization: Bearer $CRON_SECRET" \
     https://kupsiodstin.cz/api/admin/seed-colors
   ```

7. **Point UptimeRobot** (or Better Stack / whatever you use) at `https://kupsiodstin.cz/api/healthz`. The endpoint returns 200 only when every cron's heartbeat is fresher than its threshold (executor 25 min, planner 32 days, daily-summary 25 h). Any breakage in the Disco-fires → script → wget → route → DB-write chain pages you.

### Production checklist

- [ ] `DRY_RUN=false` in Disco env
- [ ] `GOPAY_SANDBOX=false`
- [ ] Telegram chat is the right one and `@<your bot> /start` has been issued so it can DM you
- [ ] Resend domain is verified (otherwise magic-link emails won't land)
- [ ] Bank cards enrolled with the correct `monthlyAmountCzk` / `instalmentsPerMonth` per bank's bonus criteria
- [ ] `/api/healthz` is being polled by an external uptime monitor
