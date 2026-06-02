import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/admin/seed-colors/route";

function authedRequest() {
  return new Request("http://localhost/api/admin/seed-colors", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe("POST /api/admin/seed-colors", () => {
  it("rejects unauthorized requests", async () => {
    const r = await POST(
      new Request("http://localhost/api/admin/seed-colors", { method: "POST" }),
    );
    expect(r.status).toBe(401);
  });

  it("inserts all 16 CGA colours into an empty DB", async () => {
    const r = await POST(authedRequest());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.inserted).toBe(16);
    expect(body.total).toBe(16);
    expect(body.pruned).toBe(0);

    const count = await prisma.color.count();
    expect(count).toBe(16);
  });

  it("is idempotent on a second call", async () => {
    await POST(authedRequest());
    const r2 = await POST(authedRequest());
    const body2 = await r2.json();
    expect(body2.inserted).toBe(0);
    expect(body2.unchanged).toBe(16);

    const count = await prisma.color.count();
    expect(count).toBe(16);
  });

  it("prunes off-catalogue colours with no current subscription", async () => {
    // Pre-seed an off-catalogue colour that has no owner.
    await prisma.color.create({ data: { hex: "#deadbe", name: "garbage" } });

    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.pruned).toBe(1);

    const stillThere = await prisma.color.findUnique({
      where: { hex: "#deadbe" },
    });
    expect(stillThere).toBeNull();
  });

  it("does NOT prune an off-catalogue colour that has a current subscription", async () => {
    const user = await prisma.user.create({
      data: { email: "u@x.cz", username: "vumin" },
    });
    const offCat = await prisma.color.create({
      data: { hex: "#deadbe", name: "garbage" },
    });
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        colorId: offCat.id,
        monthlyAmountCzk: 100,
        status: "active",
        startedAt: new Date(),
      },
    });
    await prisma.color.update({
      where: { id: offCat.id },
      data: { currentSubscriptionId: sub.id },
    });

    const r = await POST(authedRequest());
    const body = await r.json();
    expect(body.retainedOwned).toBe(1);

    const stillThere = await prisma.color.findUnique({
      where: { hex: "#deadbe" },
    });
    expect(stillThere).not.toBeNull();
  });
});
