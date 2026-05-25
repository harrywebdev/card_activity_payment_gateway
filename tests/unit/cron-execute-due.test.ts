import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/cron/execute-due/route";
import * as gopay from "@/lib/gopay";

function authedRequest() {
  return new Request("http://localhost/api/cron/execute-due", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

async function setupSubAndDuePayment(opts?: {
  scheduledAt?: Date;
  amountCzk?: number;
  attempts?: number;
}) {
  const user = await prisma.user.create({
    data: { email: "exec@example.com", username: "vumin" },
  });
  const color = await prisma.color.create({
    data: { hex: "#000000", name: "černá" },
  });
  const pm = await prisma.paymentMethod.create({
    data: {
      userId: user.id,
      gopayPaymentId: "12345",
      lastFour: "1111",
      bankName: "Sandbox",
      status: "active",
    },
  });
  const sub = await prisma.subscription.create({
    data: {
      userId: user.id,
      colorId: color.id,
      paymentMethodId: pm.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      status: "active",
      startedAt: new Date(),
    },
  });
  const plan = await prisma.subscriptionPlan.create({
    data: {
      subscriptionId: sub.id,
      year: 2026,
      month: 6,
      targetInstalments: 10,
      completedInstalments: 1,
      status: "active",
    },
  });
  const sp = await prisma.scheduledPayment.create({
    data: {
      subscriptionPlanId: plan.id,
      amountCzk: opts?.amountCzk ?? 10,
      scheduledAt: opts?.scheduledAt ?? new Date(Date.now() - 60_000),
      status: "pending",
      attempts: opts?.attempts ?? 0,
    },
  });
  return { sub, plan, sp };
}

describe("POST /api/cron/execute-due", () => {
  it("rejects unauthorized requests", async () => {
    const r = await POST(
      new Request("http://localhost/api/cron/execute-due", { method: "POST" }),
    );
    expect(r.status).toBe(401);
  });

  it("charges a due payment successfully (DRY_RUN GoPay returns PAID)", async () => {
    const { sp, plan } = await setupSubAndDuePayment();
    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.processed).toBe(1);
    expect(body.succeeded).toBe(1);

    const updated = await prisma.scheduledPayment.findUnique({
      where: { id: sp.id },
    });
    expect(updated!.status).toBe("succeeded");
    expect(updated!.attempts).toBe(1);

    const tx = await prisma.transaction.findFirst({
      where: { scheduledPaymentId: sp.id },
    });
    expect(tx!.status).toBe("succeeded");
    expect(tx!.gopayPaymentId).toBeTruthy();

    const updatedPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: plan.id },
    });
    expect(updatedPlan!.completedInstalments).toBe(2); // was 1, +1
  });

  it("skips not-yet-due payments", async () => {
    await setupSubAndDuePayment({
      scheduledAt: new Date(Date.now() + 60 * 60_000),
    });
    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.processed).toBe(0);
  });

  it("retries with backoff on transient GoPay failure (attempts < max)", async () => {
    const { sp } = await setupSubAndDuePayment();
    const spy = vi
      .spyOn(gopay, "createRecurrence")
      .mockRejectedValueOnce(new Error("simulated transient error"));

    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.retried).toBe(1);
    expect(body.failed).toBe(0);

    const updated = await prisma.scheduledPayment.findUnique({
      where: { id: sp.id },
    });
    expect(updated!.status).toBe("pending");
    expect(updated!.attempts).toBe(1);
    expect(updated!.lastError).toContain("simulated transient");
    // scheduledAt pushed into the future (10 min backoff)
    expect(updated!.scheduledAt.getTime()).toBeGreaterThan(
      Date.now() + 5 * 60_000,
    );

    spy.mockRestore();
  });

  it("marks as failed after exhausting retries and logs a failed Transaction", async () => {
    const { sp } = await setupSubAndDuePayment({ attempts: 2 }); // one more failure should exhaust
    const spy = vi
      .spyOn(gopay, "createRecurrence")
      .mockRejectedValueOnce(new Error("hard failure"));

    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.failed).toBe(1);

    const updated = await prisma.scheduledPayment.findUnique({
      where: { id: sp.id },
    });
    expect(updated!.status).toBe("failed");
    expect(updated!.attempts).toBe(3);

    const tx = await prisma.transaction.findFirst({
      where: { scheduledPaymentId: sp.id },
    });
    expect(tx!.status).toBe("failed");
    expect(tx!.error).toContain("hard failure");

    spy.mockRestore();
  });

  it("writes a heartbeat row even when nothing is due", async () => {
    const r = await POST(authedRequest());
    expect(r.status).toBe(200);
    const hb = await prisma.systemHeartbeat.findUnique({
      where: { jobName: "executor" },
    });
    expect(hb).not.toBeNull();
    expect(hb!.lastStatus).toBe("ok");
  });
});
