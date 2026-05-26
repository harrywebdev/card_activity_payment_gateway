# Kup si Odstín

`kupsiodstin.cz` — a 16-colour subscription storefront. Pick one of the IBM CGA shades from 1981, set what you want to pay per month and over how many instalments, and the colour is yours on the catalogue until you stop paying. One owner per colour at a time.

## How it works

1. **Sign in with a magic link** (allowlisted emails only). On first sign-in you're assigned a unique 5-letter username (e.g. `karpa`) — that's your public identity on colour owner pages.
2. **Pick a free colour** from the 16-colour CGA palette. Each colour has one owner at a time.
3. **Set the terms** — pick `monthlyAmountCzk` (what you want to pay each month) and `instalmentsPerMonth` (how many separate charges to split it into; each instalment must be at least 1 CZK).
4. **First payment goes through GoPay's hosted page.** Card details stay with GoPay; we never see them.
5. **The rest of the month runs unattended.** Disco's scheduler triggers our executor every 10 minutes, which charges saved card tokens for any instalments that are due.
6. **Telegram notifications** for per-instalment confirmations, daily progress digests, monthly recaps, and error alerts.

## Why GoPay

For micro-transactions in CZK:

| Processor | Per-tx fee        | Monthly fee | Cost on a 20 CZK charge |
| --------- | ----------------- | ----------- | ----------------------- |
| Stripe    | 1.5% + 6.50 CZK   | 0 CZK       | 6.80 CZK (34%)          |
| Comgate   | 1% + 0 CZK        | 100 CZK     | 0.20 CZK (1%)           |
| **GoPay** | **0.95% + 0 CZK** | **80 CZK**  | **0.19 CZK (0.95%)**    |

GoPay wins: no fixed per-transaction fee (critical for small amounts), lowest percentage rate, ON_DEMAND recurring payment support, 12 months free on the Start plan.

## Tech Stack

- **TypeScript / Next.js 16** (App Router, server components)
- **Tailwind CSS v4** + a custom MS-DOS textmode design (CGA 16 palette, VT323 + IBM Plex Mono)
- **iron-session** — stateless encrypted-cookie auth, no sessions table
- **Resend** — magic-link emails
- **GoPay** — payment processing (REST API, OAuth2, ON_DEMAND recurrence, merchant-initiated transactions)
- **SQLite** via Prisma 7 + `@prisma/adapter-better-sqlite3`; migrations run via `prisma migrate deploy` in a dedicated migrator container on every deploy
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

   | Var                                                           | Where to get it                                                   |
   | ------------------------------------------------------------- | ----------------------------------------------------------------- |
   | `DATABASE_URL`                                                | Set to `file:/app/data/gateway.db`                                |
   | `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOPAY_MERCHANT_ID` | GoPay merchant dashboard → API keys                               |
   | `GOPAY_SANDBOX`                                               | `false` for production, `true` for sandbox                        |
   | `ALLOWED_EMAILS`                                              | Comma-separated list of emails permitted to sign in               |
   | `COOKIE_SECRET`                                               | `openssl rand -base64 48`                                         |
   | `CRON_SECRET`                                                 | `openssl rand -base64 32`                                         |
   | `RESEND_API_KEY`                                              | resend.com dashboard                                              |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                      | @BotFather and getUpdates                                         |
   | `NEXT_PUBLIC_BASE_URL`                                        | `https://kupsiodstin.cz`                                          |
   | `NEXT_PUBLIC_APP_ENV`                                         | `production`                                                      |
   | `DRY_RUN`                                                     | `false` for production (`true` skips GoPay/Resend/Telegram sends) |

   Copy-paste ready (fill in the `<...>` placeholders):

   ```bash
   disco env:set \
     DATABASE_URL='file:/app/data/gateway.db' \
     GOPAY_CLIENT_ID='<from GoPay merchant dashboard>' \
     GOPAY_CLIENT_SECRET='<from GoPay merchant dashboard>' \
     GOPAY_MERCHANT_ID='<from GoPay merchant dashboard>' \
     GOPAY_SANDBOX='false' \
     ALLOWED_EMAILS='<comma-separated emails>' \
     COOKIE_SECRET="$(openssl rand -base64 48)" \
     CRON_SECRET="$(openssl rand -base64 32)" \
     RESEND_API_KEY='<from resend.com dashboard>' \
     TELEGRAM_BOT_TOKEN='<from @BotFather>' \
     TELEGRAM_CHAT_ID='<from getUpdates>' \
     NEXT_PUBLIC_BASE_URL='https://kupsiodstin.cz' \
     NEXT_PUBLIC_APP_ENV='production' \
     DRY_RUN='false'
   ```

4. **Attach the domain** `kupsiodstin.cz` to the `web` service. Disco handles the certificate via Let's Encrypt.
5. **Deploy.** The first deploy will create the SQLite DB on the volume via `prisma migrate deploy`.
6. **Seed the colour catalogue** (one-shot, idempotent — safe to re-run):

   ```bash
   disco run "sh -c 'wget -qO- --post-data= --header=\"Authorization: Bearer \$CRON_SECRET\" http://web:3000/api/admin/seed-colors'" --project kupsiodstin --service web
   ```

7. **Point UptimeRobot** (or Better Stack / whatever you use) at `https://kupsiodstin.cz/api/healthz`. The endpoint returns 200 only when every cron's heartbeat is fresher than its threshold (executor 25 min, planner 32 days, daily-summary 25 h). Any breakage in the Disco-fires → script → wget → route → DB-write chain pages you.

### Production checklist

- [ ] `DRY_RUN=false` in Disco env
- [ ] `GOPAY_SANDBOX=false`
- [ ] Telegram chat is the right one and `@<your bot> /start` has been issued so it can DM you
- [ ] Resend domain is verified (otherwise magic-link emails won't land)
- [ ] `/api/healthz` is being polled by an external uptime monitor
