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
    // Set up: a subscription whose May 2026 charge succeeded.
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
        status: "active",
        startedAt: new Date(2026, 4, 1),
      },
    });
    const sp = await prisma.scheduledPayment.create({
      data: {
        subscriptionId: sub.id,
        year: 2026,
        month: 5,
        amountCzk: 100,
        scheduledAt: new Date(2026, 4, 15, 12, 0, 0),
        status: "succeeded",
        attempts: 1,
      },
    });
    await prisma.transaction.create({
      data: {
        scheduledPaymentId: sp.id,
        amountCzk: 100,
        status: "succeeded",
        gopayPaymentId: "tx1",
        executedAt: new Date(2026, 4, 15, 12, 0, 0),
      },
    });

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
    expect(recap).toContain("černá");
    expect(recap).toContain("100");

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
        status: "active",
        startedAt: new Date(),
      },
    });
    const now = new Date();
    const sp = await prisma.scheduledPayment.create({
      data: {
        subscriptionId: sub.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amountCzk: 100,
        scheduledAt: new Date(Date.now() - 60_000),
        status: "succeeded",
        attempts: 1,
      },
    });
    await prisma.transaction.create({
      data: {
        scheduledPaymentId: sp.id,
        amountCzk: 100,
        status: "succeeded",
        gopayPaymentId: "abc",
        executedAt: new Date(),
      },
    });
    // A failed transaction earlier today, parented to the same row (it's
    // the previous attempt that ultimately succeeded).
    await prisma.transaction.create({
      data: {
        scheduledPaymentId: sp.id,
        amountCzk: 100,
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
