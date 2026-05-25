import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/cron/daily-summary/route";
import * as telegram from "@/lib/telegram";

function authedRequest() {
  return new Request("http://localhost/api/cron/daily-summary", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe("POST /api/cron/daily-summary", () => {
  it("rejects unauthorized requests", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/daily-summary", {
        method: "POST",
      }),
    );
    expect(r.status).toBe(401);
  });

  it("writes a heartbeat with subs=0 when no active subscriptions exist", async () => {
    const r = await POST(authedRequest());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.subscriptions).toBe(0);

    const hb = await prisma.systemHeartbeat.findUnique({
      where: { jobName: "daily_summary" },
    });
    expect(hb!.lastStatus).toBe("ok");
  });

  afterEach(() => vi.useRealTimers());

  it("posts a monthly recap to Telegram on the 1st of the month", async () => {
    // Set up: a subscription that finished its plan last month (May 2026)
    const user = await prisma.user.create({
      data: { email: "recap@example.com", username: "vumin" },
    });
    const color = await prisma.color.create({
      data: { hex: "#000000", name: "černá" },
    });
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        colorId: color.id,
        monthlyAmountCzk: 100,
        instalmentsPerMonth: 10,
        status: "active",
        startedAt: new Date(2026, 4, 1),
      },
    });
    const plan = await prisma.subscriptionPlan.create({
      data: {
        subscriptionId: sub.id,
        year: 2026,
        month: 5,
        targetInstalments: 10,
        completedInstalments: 10,
        status: "completed",
      },
    });
    // 10 successful ScheduledPayments with Transactions for the recap to count.
    for (let i = 0; i < 10; i++) {
      const sp = await prisma.scheduledPayment.create({
        data: {
          subscriptionPlanId: plan.id,
          amountCzk: 10,
          scheduledAt: new Date(2026, 4, 5 + i, 12, 0, 0),
          status: "succeeded",
          attempts: 1,
        },
      });
      await prisma.transaction.create({
        data: {
          scheduledPaymentId: sp.id,
          amountCzk: 10,
          status: "succeeded",
          gopayPaymentId: `t${i}`,
          executedAt: new Date(2026, 4, 5 + i, 12, 0, 0),
        },
      });
    }

    // Spy + force "now" to 2026-06-01 21:00 so the day-1 branch fires.
    const sent: string[] = [];
    const spy = vi
      .spyOn(telegram, "sendTelegram")
      .mockImplementation(async (txt) => {
        sent.push(txt);
      });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 21, 0, 0));

    const req = new Request("http://localhost/api/cron/daily-summary", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const r = await POST(req);
    const body = await r.json();
    expect(body.monthlyRecapSent).toBe(true);

    // Daily (active sub, may have nothing today) + monthly recap (1st)
    const recap = sent.find((s) => s.includes("Měsíční rekapitulace"));
    expect(recap).toBeTruthy();
    expect(recap).toContain("10/10");
    expect(recap).toContain("černá");

    spy.mockRestore();
  });

  it("does NOT send a monthly recap on non-first days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 21, 0, 0));

    const req = new Request("http://localhost/api/cron/daily-summary", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const r = await POST(req);
    const body = await r.json();
    expect(body.monthlyRecapSent).toBe(false);
  });

  it("counts today's transactions per active subscription", async () => {
    const user = await prisma.user.create({
      data: { email: "ds@example.com", username: "vumin" },
    });
    const color = await prisma.color.create({
      data: { hex: "#000000", name: "černá" },
    });
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        colorId: color.id,
        monthlyAmountCzk: 100,
        instalmentsPerMonth: 10,
        status: "active",
        startedAt: new Date(),
      },
    });
    const now = new Date();
    const plan = await prisma.subscriptionPlan.create({
      data: {
        subscriptionId: sub.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        targetInstalments: 10,
        completedInstalments: 2,
        status: "active",
      },
    });
    const sp = await prisma.scheduledPayment.create({
      data: {
        subscriptionPlanId: plan.id,
        amountCzk: 10,
        scheduledAt: new Date(Date.now() - 60_000),
        status: "succeeded",
        attempts: 1,
      },
    });
    await prisma.transaction.create({
      data: {
        scheduledPaymentId: sp.id,
        amountCzk: 10,
        status: "succeeded",
        gopayPaymentId: "abc",
        executedAt: new Date(),
      },
    });
    // A failed transaction earlier today
    const sp2 = await prisma.scheduledPayment.create({
      data: {
        subscriptionPlanId: plan.id,
        amountCzk: 10,
        scheduledAt: new Date(Date.now() - 120_000),
        status: "failed",
        attempts: 3,
      },
    });
    await prisma.transaction.create({
      data: {
        scheduledPaymentId: sp2.id,
        amountCzk: 10,
        status: "failed",
        error: "test",
        executedAt: new Date(),
      },
    });

    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.subscriptions).toBe(1);
    expect(body.dailySuccess).toBe(1);
    expect(body.dailyFailed).toBe(1);
  });
});
