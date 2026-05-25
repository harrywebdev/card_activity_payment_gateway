import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/healthz/route";
import { HEALTHCHECK } from "@/lib/config";

describe("GET /api/healthz", () => {
  it("returns 503 when no heartbeats have ever been recorded", async () => {
    const r = await GET();
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body.status).toBe("unhealthy");
    expect(body.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ job: "executor", status: "missing" }),
        expect.objectContaining({ job: "planner", status: "missing" }),
        expect.objectContaining({ job: "daily_summary", status: "missing" }),
      ]),
    );
  });

  it("returns 200 when every job's heartbeat is fresh", async () => {
    const now = new Date();
    await prisma.systemHeartbeat.createMany({
      data: [
        { jobName: "executor", lastRunAt: now, lastStatus: "ok" },
        { jobName: "planner", lastRunAt: now, lastStatus: "ok" },
        { jobName: "daily_summary", lastRunAt: now, lastStatus: "ok" },
      ],
    });
    const r = await GET();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("ok");
    for (const job of body.jobs) expect(job.status).toBe("ok");
  });

  it("returns 503 when the executor heartbeat is stale", async () => {
    const stale = new Date(
      Date.now() - (HEALTHCHECK.executorStaleMinutes + 5) * 60_000,
    );
    const fresh = new Date();
    await prisma.systemHeartbeat.createMany({
      data: [
        { jobName: "executor", lastRunAt: stale, lastStatus: "ok" },
        { jobName: "planner", lastRunAt: fresh, lastStatus: "ok" },
        { jobName: "daily_summary", lastRunAt: fresh, lastStatus: "ok" },
      ],
    });
    const r = await GET();
    expect(r.status).toBe(503);
    const body = await r.json();
    const exec = body.jobs.find((j: { job: string }) => j.job === "executor");
    expect(exec.status).toBe("stale");
  });

  it("returns 503 when a heartbeat status is error", async () => {
    const fresh = new Date();
    await prisma.systemHeartbeat.createMany({
      data: [
        { jobName: "executor", lastRunAt: fresh, lastStatus: "error", lastMessage: "boom" },
        { jobName: "planner", lastRunAt: fresh, lastStatus: "ok" },
        { jobName: "daily_summary", lastRunAt: fresh, lastStatus: "ok" },
      ],
    });
    const r = await GET();
    expect(r.status).toBe(503);
    const body = await r.json();
    const exec = body.jobs.find((j: { job: string }) => j.job === "executor");
    expect(exec.status).toBe("error");
    expect(exec.lastMessage).toBe("boom");
  });
});
