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

- **TypeScript / Next.js 15** (App Router, server components, server actions)
- **Tailwind CSS + shadcn/ui** — design system
- **iron-session** — stateless encrypted-cookie auth, no sessions table
- **Resend** — magic-link emails
- **GoPay** — payment processing (REST API, OAuth2, ON_DEMAND recurrence)
- **SQLite** via Drizzle ORM (WAL mode for safe multi-process access)
- **Disco.cloud** — Docker deployment + native cron scheduler
- **Telegram Bot API** — notifications

## Setup

```bash
cp .env.example .env
# Fill in GoPay credentials, Resend key, Telegram bot token, allowlisted emails, etc.
# Generate COOKIE_SECRET with: openssl rand -base64 48

npm install
npm run dev
```

See [.env.example](.env.example) for the full list of required environment variables, and [.claude/plans/implementation-plan.md](.claude/plans/implementation-plan.md) for the architecture, schema, and Disco deployment intent.

## Deployment

Single multi-stage Dockerfile. On Disco.cloud:

- One long-running **web service** (Next.js standalone, port 3000, `/data` volume).
- Three Disco **scheduled jobs** invoking the same image with overridden command:
  - `*/10 * * * *` → `node dist/cli/execute-due.js` (process due payments)
  - `0 0 1 * *` → `node dist/cli/plan-month.js` (generate next month's schedule)
  - `0 21 * * *` → `node dist/cli/daily-summary.js` (Telegram digest)

Uptime monitoring: point UptimeRobot / Better Stack at `/healthz` — it reads the heartbeat table and only returns 200 if the executor cron has fired within the last 25 minutes, so cron failures page you.
