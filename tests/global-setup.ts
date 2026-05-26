/**
 * Vitest global setup — runs ONCE before any test file imports anything.
 *
 * Deletes any previous test SQLite file and rebuilds the schema via
 * `prisma migrate deploy`. Per-test truncation happens in tests/setup.ts.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DB_PATH = path.resolve(process.cwd(), "data/test.db");

export default async function setup() {
  // Provide env values that satisfy src/lib/config.ts at module-load time.
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  process.env.GOPAY_CLIENT_ID = process.env.GOPAY_CLIENT_ID ?? "test-client";
  process.env.GOPAY_CLIENT_SECRET =
    process.env.GOPAY_CLIENT_SECRET ?? "test-secret";
  process.env.GOPAY_MERCHANT_ID = process.env.GOPAY_MERCHANT_ID ?? "12345678";
  process.env.GOPAY_SANDBOX = "true";
  process.env.ALLOWED_EMAILS =
    process.env.ALLOWED_EMAILS ?? "marek.burc@gmail.com,other.test@example.com";
  process.env.COOKIE_SECRET =
    process.env.COOKIE_SECRET ??
    "00000000000000000000000000000000000000000000000000000000";
  process.env.CRON_SECRET =
    process.env.CRON_SECRET ?? "test-cron-secret-for-tests";
  process.env.MAILGUN_API_KEY =
    process.env.MAILGUN_API_KEY ?? "test-mailgun-key";
  process.env.MAILGUN_DOMAIN =
    process.env.MAILGUN_DOMAIN ?? "sandbox-test.mailgun.org";
  process.env.MAILGUN_FROM =
    process.env.MAILGUN_FROM ?? "test@sandbox-test.mailgun.org";
  process.env.MAILGUN_REGION = process.env.MAILGUN_REGION ?? "eu";
  process.env.NEXT_PUBLIC_BASE_URL =
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.DRY_RUN = "true";

  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  for (const f of [TEST_DB_PATH, TEST_DB_PATH + "-journal"]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }

  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "pipe",
  });
}
