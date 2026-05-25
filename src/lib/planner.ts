import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { SCHEDULE } from "@/lib/config";

/**
 * Split an integer CZK amount into N parts that sum exactly to it.
 * Earlier parts may be 1 CZK heavier than later ones if the division
 * doesn't come out clean.
 *
 * Example: splitAmount(100, 7) → [15, 15, 14, 14, 14, 14, 14] (sum 100)
 */
export function splitAmount(totalCzk: number, parts: number): number[] {
  if (parts <= 0) throw new Error("parts must be > 0");
  const base = Math.floor(totalCzk / parts);
  const remainder = totalCzk - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

/**
 * Pick `count` random timestamps within [day=lo, day=hi] × [hour=earliest..latest].
 *
 * Days are sampled with replacement so the function never silently drops
 * instalments when the day window is shorter than the count (e.g. a user
 * subscribes on the 25th with 10 instalments — they still get all 10
 * charges this month, just bunched onto the 2-3 remaining days).
 *
 * With a normal window (≥20 days) and small count, same-day collisions
 * are rare and the result is effectively "one per day".
 */
function pickTimestamps(
  year: number,
  monthIndex: number,
  lo: number,
  hi: number,
  count: number,
): Date[] {
  const stamps: Date[] = [];
  for (let i = 0; i < count; i++) {
    const day = lo + randomInt(0, hi - lo + 1);
    const hour = randomInt(SCHEDULE.earliestHour, SCHEDULE.latestHour + 1);
    const minute = randomInt(0, 60);
    const second = randomInt(0, 60);
    stamps.push(new Date(year, monthIndex, day, hour, minute, second));
  }
  return stamps.sort((a, b) => a.getTime() - b.getTime());
}

type PlanInput = {
  subscriptionId: string;
  monthlyAmountCzk: number;
  instalmentsPerMonth: number;
  /** Pass `1` when called from the subscribe webhook (initial payment counts as instalment 1). */
  alreadyCompleted: number;
  /** Defaults to today. */
  asOf?: Date;
};

/**
 * Idempotently creates a SubscriptionPlan + ScheduledPayments for the
 * given subscription's current month. Returns the plan id (existing or new).
 *
 * If a plan already exists for (subscription, year, month), this is a no-op
 * and the existing plan id is returned — re-running the planner is safe.
 */
export async function planSubscriptionForMonth({
  subscriptionId,
  monthlyAmountCzk,
  instalmentsPerMonth,
  alreadyCompleted,
  asOf = new Date(),
}: PlanInput): Promise<{ planId: string; created: boolean }> {
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1; // human month 1-12

  const existing = await prisma.subscriptionPlan.findUnique({
    where: {
      subscriptionId_year_month: { subscriptionId, year, month },
    },
  });

  if (existing) {
    return { planId: existing.id, created: false };
  }

  const remainingCount = Math.max(0, instalmentsPerMonth - alreadyCompleted);

  // Day window: never before tomorrow (the initial payment already used today,
  // and we don't want to schedule "in the past" if we plan on day 15 etc.).
  const earliestDay = Math.max(SCHEDULE.startDay, asOf.getDate() + 1);
  const lo = Math.min(earliestDay, SCHEDULE.endDay);
  const hi = SCHEDULE.endDay;

  const timestamps =
    remainingCount > 0
      ? pickTimestamps(year, asOf.getMonth(), lo, hi, remainingCount)
      : [];
  const amounts = splitAmount(monthlyAmountCzk, instalmentsPerMonth);
  // The first `alreadyCompleted` amounts are spoken for by past payments;
  // the rest map to the timestamps we just picked, in order.
  const scheduledAmounts = amounts.slice(alreadyCompleted);

  const plan = await prisma.subscriptionPlan.create({
    data: {
      subscriptionId,
      year,
      month,
      targetInstalments: instalmentsPerMonth,
      completedInstalments: alreadyCompleted,
      status: "active",
      scheduledPayments: {
        create: timestamps.map((scheduledAt, i) => ({
          amountCzk: scheduledAmounts[i] ?? 0,
          scheduledAt,
          status: "pending",
        })),
      },
    },
  });

  return { planId: plan.id, created: true };
}
