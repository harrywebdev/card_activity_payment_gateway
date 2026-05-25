import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/cron/plan-month/route";

function authedRequest() {
  return new Request("http://localhost/api/cron/plan-month", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

async function createActiveSub(hex = "#000000") {
  const user = await prisma.user.create({
    data: { email: `${hex.slice(1)}@x.cz`, username: hex.slice(1, 6) },
  });
  const color = await prisma.color.create({ data: { hex, name: hex } });
  return prisma.subscription.create({
    data: {
      userId: user.id,
      colorId: color.id,
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      status: "active",
      startedAt: new Date(),
    },
  });
}

describe("POST /api/cron/plan-month", () => {
  it("rejects unauthorized requests", async () => {
    const r = await POST(new Request("http://localhost/api/cron/plan-month", { method: "POST" }));
    expect(r.status).toBe(401);
  });

  it("creates plans for active subscriptions and skips ones that already have one", async () => {
    await createActiveSub("#000000");
    await createActiveSub("#0000aa");

    const r1 = await POST(authedRequest());
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.created).toBe(2);
    expect(body1.skipped).toBe(0);

    const r2 = await POST(authedRequest());
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.created).toBe(0);
    expect(body2.skipped).toBe(2);
  });

  it("writes a heartbeat row", async () => {
    await POST(authedRequest());
    const hb = await prisma.systemHeartbeat.findUnique({ where: { jobName: "planner" } });
    expect(hb).not.toBeNull();
    expect(hb!.lastStatus).toBe("ok");
  });

  it("skips cancelled subscriptions", async () => {
    const sub = await createActiveSub("#aa0000");
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.total).toBe(0);
  });
});
