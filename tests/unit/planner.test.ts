import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { planSubscriptionForMonth } from "@/lib/planner";
import { SCHEDULE } from "@/lib/config";

describe("planSubscriptionForMonth", () => {
  async function setupSubscription(
    overrides: { monthlyAmountCzk?: number } = {},
  ) {
    const user = await prisma.user.create({
      data: { email: "tester@example.com", username: "vumin" },
    });
    const color = await prisma.color.create({
      data: { hex: "#000000", name: "černá" },
    });
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        colorId: color.id,
        monthlyAmountCzk: overrides.monthlyAmountCzk ?? 100,
        status: "active",
        startedAt: new Date(),
      },
    });
    return { user, color, subscription };
  }

  it("creates exactly one ScheduledPayment for the full monthly amount", async () => {
    const { subscription } = await setupSubscription();
    // Pretend it's the 1st of the month for predictability.
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const { scheduledPaymentId, created } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      asOf,
    });
    expect(created).toBe(true);
    expect(scheduledPaymentId).not.toBeNull();

    const sp = await prisma.scheduledPayment.findUnique({
      where: { id: scheduledPaymentId! },
    });
    expect(sp).not.toBeNull();
    expect(sp!.amountCzk).toBe(100);
    expect(sp!.status).toBe("pending");
    expect(sp!.year).toBe(2026);
    expect(sp!.month).toBe(6);
  });

  it("is idempotent — re-running for the same (sub, year, month) returns the existing row", async () => {
    const { subscription } = await setupSubscription();
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const first = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      asOf,
    });
    const second = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      asOf,
    });
    expect(second.scheduledPaymentId).toBe(first.scheduledPaymentId);
    expect(second.created).toBe(false);

    const count = await prisma.scheduledPayment.count();
    expect(count).toBe(1); // Not doubled.
  });

  it("returns created=false and no row when skipThisMonth is set (initial enrolment path)", async () => {
    const { subscription } = await setupSubscription();

    const { scheduledPaymentId, created } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      skipThisMonth: true,
    });
    expect(created).toBe(false);
    expect(scheduledPaymentId).toBeNull();

    const count = await prisma.scheduledPayment.count();
    expect(count).toBe(0);
  });

  it("scheduled timestamp falls inside the day+hour window", async () => {
    const { subscription } = await setupSubscription();
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const { scheduledPaymentId } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      asOf,
    });
    const sp = await prisma.scheduledPayment.findUnique({
      where: { id: scheduledPaymentId! },
    });
    const d = sp!.scheduledAt;
    expect(d.getMonth()).toBe(asOf.getMonth());
    expect(d.getDate()).toBeGreaterThanOrEqual(SCHEDULE.startDay);
    expect(d.getDate()).toBeLessThanOrEqual(SCHEDULE.endDay);
    expect(d.getHours()).toBeGreaterThanOrEqual(SCHEDULE.earliestHour);
    expect(d.getHours()).toBeLessThanOrEqual(SCHEDULE.latestHour);
  });

  it("late-month invocation never schedules in the past", async () => {
    const { subscription } = await setupSubscription();
    // Run on the 25th — the only days left before SCHEDULE.endDay (27)
    // are 26, 27. The schedule must still land in this month.
    const asOf = new Date(2026, 5, 25, 10, 0, 0);

    const { scheduledPaymentId } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      asOf,
    });

    const sp = await prisma.scheduledPayment.findUnique({
      where: { id: scheduledPaymentId! },
    });
    expect(sp!.scheduledAt.getMonth()).toBe(asOf.getMonth());
    expect(sp!.scheduledAt.getDate()).toBeGreaterThanOrEqual(26);
    expect(sp!.scheduledAt.getDate()).toBeLessThanOrEqual(SCHEDULE.endDay);
  });
});
