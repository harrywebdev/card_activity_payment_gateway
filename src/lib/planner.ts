import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { SCHEDULE } from "@/lib/config";

/**
 * Pick a random timestamp within [day=lo, day=hi] × [hour=earliest..latest]
 * of the given month. Used to spread monthly charges across the window
 * instead of hammering GoPay at midnight on the 1st.
 */
function pickTimestamp(
  year: number,
  monthIndex: number,
  lo: number,
  hi: number,
): Date {
  const day = lo + randomInt(0, hi - lo + 1);
  const hour = randomInt(SCHEDULE.earliestHour, SCHEDULE.latestHour + 1);
  const minute = randomInt(0, 60);
  const second = randomInt(0, 60);
  return new Date(year, monthIndex, day, hour, minute, second);
}

type PlanInput = {
  subscriptionId: string;
  monthlyAmountCzk: number;
  /** Skip scheduling this month (the initial enrolment payment already covered it). */
  skipThisMonth?: boolean;
  /** Defaults to today. */
  asOf?: Date;
};

/**
 * Idempotently creates this month's ScheduledPayment for the given
 * subscription. Returns whether a new row was created.
 *
 * If a ScheduledPayment already exists for (subscription, year, month),
 * this is a no-op — re-running the planner is always safe.
 *
 * Pass `skipThisMonth: true` from the activation webhook: the user just
 * paid the monthly amount via GoPay's hosted page, so the next charge is
 * not until next month's planner run.
 */
export async function planSubscriptionForMonth({
  subscriptionId,
  monthlyAmountCzk,
  skipThisMonth = false,
  asOf = new Date(),
}: PlanInput): Promise<{ scheduledPaymentId: string | null; created: boolean }> {
  if (skipThisMonth) {
    return { scheduledPaymentId: null, created: false };
  }

  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1; // human month 1-12

  const existing = await prisma.scheduledPayment.findUnique({
    where: { subscriptionId_year_month: { subscriptionId, year, month } },
  });
  if (existing) {
    return { scheduledPaymentId: existing.id, created: false };
  }

  // Never schedule "in the past" — if we're already past SCHEDULE.endDay
  // (e.g. planner runs late), schedule for as soon as the executor's next
  // tick rather than dropping the month.
  const earliestDay = Math.max(SCHEDULE.startDay, asOf.getDate() + 1);
  const lo = Math.min(earliestDay, SCHEDULE.endDay);
  const hi = Math.max(lo, SCHEDULE.endDay);

  const scheduledAt = pickTimestamp(year, asOf.getMonth(), lo, hi);

  const sp = await prisma.scheduledPayment.create({
    data: {
      subscriptionId,
      year,
      month,
      amountCzk: monthlyAmountCzk,
      scheduledAt,
      status: "pending",
    },
  });

  return { scheduledPaymentId: sp.id, created: true };
}
