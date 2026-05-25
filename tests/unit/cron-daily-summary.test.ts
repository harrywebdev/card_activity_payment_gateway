import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/cron/daily-summary/route";

function authedRequest() {
  return new Request("http://localhost/api/cron/daily-summary", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe("POST /api/cron/daily-summary", () => {
  it("rejects unauthorized requests", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/daily-summary", { method: "POST" }),
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

  it("counts today's transactions per active subscription", async () => {
    const user = await prisma.user.create({
      data: { email: "ds@example.com", username: "vumin" },
    });
    const color = await prisma.color.create({ data: { hex: "#000000", name: "černá" } });
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
