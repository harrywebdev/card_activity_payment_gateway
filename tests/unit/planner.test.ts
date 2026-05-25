import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { planSubscriptionForMonth, splitAmount } from "@/lib/planner";
import { SCHEDULE } from "@/lib/config";

describe("splitAmount", () => {
  it("sums exactly to the total", () => {
    expect(splitAmount(100, 10)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(splitAmount(100, 7).reduce((a, x) => a + x, 0)).toBe(100);
    expect(splitAmount(1000, 13).reduce((a, x) => a + x, 0)).toBe(1000);
    expect(splitAmount(1, 1)).toEqual([1]);
  });

  it("puts the remainder on the earlier instalments", () => {
    // 100 / 7 = 14 r 2 → first 2 get 15, rest get 14
    expect(splitAmount(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("throws for parts <= 0", () => {
    expect(() => splitAmount(100, 0)).toThrow();
    expect(() => splitAmount(100, -1)).toThrow();
  });

  it("handles total < parts (some instalments are zero)", () => {
    const r = splitAmount(3, 10);
    expect(r.reduce((a, x) => a + x, 0)).toBe(3);
    expect(r.filter((x) => x > 0).length).toBe(3);
    expect(r.filter((x) => x === 0).length).toBe(7);
  });
});

describe("planSubscriptionForMonth", () => {
  async function setupSubscription(overrides: { instalmentsPerMonth?: number; monthlyAmountCzk?: number } = {}) {
    const user = await prisma.user.create({
      data: { email: "tester@example.com", username: "vumin" },
    });
    const color = await prisma.color.create({ data: { hex: "#000000", name: "černá" } });
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        colorId: color.id,
        monthlyAmountCzk: overrides.monthlyAmountCzk ?? 100,
        instalmentsPerMonth: overrides.instalmentsPerMonth ?? 10,
        status: "active",
        startedAt: new Date(),
      },
    });
    return { user, color, subscription };
  }

  it("creates a SubscriptionPlan with the right targets and N-1 future scheduled payments", async () => {
    const { subscription } = await setupSubscription();
    // Pretend it's the 1st of the month for predictability.
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const { planId, created } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      alreadyCompleted: 1,
      asOf,
    });
    expect(created).toBe(true);

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { scheduledPayments: true },
    });
    expect(plan!.targetInstalments).toBe(10);
    expect(plan!.completedInstalments).toBe(1);
    expect(plan!.scheduledPayments).toHaveLength(9);

    const sum = plan!.scheduledPayments.reduce((a, sp) => a + sp.amountCzk, 0);
    expect(sum).toBe(90); // The 9 remaining of a 100 CZK split-10
  });

  it("is idempotent — re-running for the same (sub, year, month) returns the existing plan", async () => {
    const { subscription } = await setupSubscription();
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const first = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      alreadyCompleted: 1,
      asOf,
    });
    const second = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      alreadyCompleted: 1,
      asOf,
    });
    expect(second.planId).toBe(first.planId);
    expect(second.created).toBe(false);

    const count = await prisma.scheduledPayment.count();
    expect(count).toBe(9); // Not doubled.
  });

  it("schedules every instalment even when the day window is short (late-month subscribe)", async () => {
    const { subscription } = await setupSubscription({ instalmentsPerMonth: 10 });
    // Subscribe on the 25th — only days 26, 27 remain before SCHEDULE.endDay (27).
    const asOf = new Date(2026, 5, 25, 10, 0, 0);

    const { planId } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      alreadyCompleted: 1,
      asOf,
    });

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { scheduledPayments: true },
    });
    // 10 instalments - 1 already done = 9 scheduled. We must NOT silently drop any.
    expect(plan!.scheduledPayments).toHaveLength(9);
  });

  it("all scheduled timestamps fall inside the day+hour window", async () => {
    const { subscription } = await setupSubscription();
    const asOf = new Date(2026, 5, 1, 10, 0, 0);

    const { planId } = await planSubscriptionForMonth({
      subscriptionId: subscription.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      alreadyCompleted: 1,
      asOf,
    });
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { scheduledPayments: true },
    });

    for (const sp of plan!.scheduledPayments) {
      const d = sp.scheduledAt;
      expect(d.getMonth()).toBe(asOf.getMonth());
      expect(d.getDate()).toBeGreaterThanOrEqual(SCHEDULE.startDay);
      expect(d.getDate()).toBeLessThanOrEqual(SCHEDULE.endDay);
      expect(d.getHours()).toBeGreaterThanOrEqual(SCHEDULE.earliestHour);
      expect(d.getHours()).toBeLessThanOrEqual(SCHEDULE.latestHour);
    }
  });
});
