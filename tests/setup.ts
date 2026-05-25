/**
 * Vitest per-file setup — re-asserts test env (in case a worker forks
 * without inheriting), then truncates all tables before each test so
 * suites can't leak state into one another.
 *
 * The actual DB file + schema is created once in tests/global-setup.ts.
 */
import { beforeEach } from "vitest";
import path from "node:path";

const TEST_DB_PATH = path.resolve(process.cwd(), "data/test.db");

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
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "test-resend";
process.env.NEXT_PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_ENV = "development";
process.env.DRY_RUN = "true";

beforeEach(async () => {
  const { prisma } = await import("@/lib/db");
  // Order matters because of FK constraints.
  await prisma.transaction.deleteMany({});
  await prisma.scheduledPayment.deleteMany({});
  await prisma.subscriptionPlan.deleteMany({});
  await prisma.color.updateMany({ data: { currentSubscriptionId: null } });
  await prisma.subscription.deleteMany({});
  await prisma.paymentMethod.deleteMany({});
  await prisma.color.deleteMany({});
  await prisma.magicLinkToken.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemHeartbeat.deleteMany({});
});
