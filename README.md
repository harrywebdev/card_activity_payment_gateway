# Card Activity Gateway

Automated payment system that generates the minimum number of card transactions required to qualify for bank bonuses (extra interest, cashback, etc.).

## Problem

Several Czech banks (CSOB, AirBank, Raiffeisen) offer bonus perks on debit/credit cards — but only if you make a minimum number of transactions per month (typically 5-10). Doing this manually is tedious and easy to forget.

## Solution

A self-hosted payment gateway that charges your own cards on a schedule. The money goes to your own merchant account, so you only lose the payment processor's commission.

**How it works:**

1. **Enroll cards once** — a simple web UI initiates a small GoPay payment for each card. You enter card details on GoPay's hosted page and complete 3DS verification.
2. **Automatic scheduling** — on the 1st of each month, the system generates a randomized schedule of charges spread naturally across days 2-27.
3. **Charges run unattended** — the scheduler triggers merchant-initiated transactions (MIT) against saved card tokens. No further 3DS/SCA needed after enrollment.
4. **Telegram notifications** — per-transaction confirmations, daily progress summaries, and error alerts via your Telegram bot.

## Why GoPay

We compared Stripe, GoPay, and Comgate for micro-transaction costs in CZK:

| Processor | Per-tx fee | Monthly fee | Cost on 20 CZK tx |
|-----------|-----------|-------------|-------------------|
| Stripe | 1.5% + 6.50 CZK | 0 CZK | 6.80 CZK (34%) |
| Comgate | 1% + 0 CZK | 100 CZK | 0.20 CZK (1%) |
| **GoPay** | **0.95% + 0 CZK** | **80 CZK** | **0.19 CZK (0.95%)** |

GoPay wins: no fixed per-transaction fee (critical for small amounts), lowest percentage rate, ON_DEMAND recurring payment support, and 12 months free on the Start plan.

## Tech Stack

- **TypeScript / Node.js**
- **GoPay** — payment processing (REST API, OAuth2)
- **SQLite** — transaction tracking (via Drizzle ORM)
- **Express** — card enrollment web UI
- **node-cron** — scheduling
- **Telegram Bot API** — notifications
- **Docker** — deployment

## Setup

```bash
cp .env.example .env
# Fill in GoPay credentials, Telegram bot token, etc.

npm install
npm run dev
```

See [.claude/plans/implementation-plan.md](.claude/plans/implementation-plan.md) for the full architecture and implementation details.
