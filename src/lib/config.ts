import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  GOPAY_CLIENT_ID: z.string().min(1),
  GOPAY_CLIENT_SECRET: z.string().min(1),
  GOPAY_MERCHANT_ID: z.string().min(1),
  GOPAY_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  RESEND_API_KEY: z.string().min(1),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  COOKIE_SECRET: z.string().min(32),
  ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  CRON_SECRET: z.string().min(16),

  NEXT_PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "production"]).default("development"),

  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.treeifyError(parsed.error));
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

// ─── Product constants (not env-driven) ──────────────────────────────────────

export const BRAND_NAME = "Kup si Odstín";
export const BRAND_TAGLINE = "Kup si svůj odstín. Vlastni jednu barvu.";

export const SCHEDULE = {
  startDay: 2,
  endDay: 27,
  earliestHour: 8,
  latestHour: 21,
  executorIntervalMinutes: 10,
} as const;

export const HEALTHCHECK = {
  executorStaleMinutes: 25,
  plannerStaleDays: 32,
  dailySummaryStaleHours: 25,
} as const;

export const AUTH = {
  magicLinkExpiryMinutes: 15,
  sessionDays: 30,
} as const;

export const EXECUTOR = {
  maxAttempts: 3,
  // Retry backoff in minutes for attempts 1, 2, 3 → wait before retry.
  retryBackoffMinutes: [10, 60, 360],
} as const;

export const USERNAME = {
  length: 5, // CVCVC
  consonants: "bcdfghjklmnprstvz",
  vowels: "aeiouy",
  maxRetries: 10,
} as const;
