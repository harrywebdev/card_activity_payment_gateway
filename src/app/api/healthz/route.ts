import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HEALTHCHECK } from "@/lib/config";

/**
 * GET /api/healthz
 *
 * Aggregate liveness probe. Validates:
 *   - Web process is up (the route responds at all).
 *   - SQLite is reachable (the SELECT succeeds).
 *   - The Disco cron services are actually firing — because heartbeats
 *     are written by the cron API routes themselves, freshness proves
 *     the full Disco → script → wget → route → DB-write chain.
 *
 * Returns 200 + {status:"ok"} if every known cron is fresh,
 * 503 + {status:"unhealthy"} otherwise.
 *
 * NOT auth-gated — meant to be polled by external uptime services
 * (UptimeRobot, Better Stack, etc.) without sharing the cron secret.
 */
export async function GET() {
  try {
    const heartbeats = await prisma.systemHeartbeat.findMany({});
    const now = Date.now();

    const expected: Record<
      string,
      { staleAfterMs: number; required: boolean }
    > = {
      executor: {
        staleAfterMs: HEALTHCHECK.executorStaleMinutes * 60_000,
        required: true,
      },
      planner: {
        staleAfterMs: HEALTHCHECK.plannerStaleDays * 24 * 60 * 60_000,
        required: true,
      },
      daily_summary: {
        staleAfterMs: HEALTHCHECK.dailySummaryStaleHours * 60 * 60_000,
        required: true,
      },
    };

    const reports: Array<{
      job: string;
      status: "ok" | "stale" | "missing" | "error";
      ageSeconds: number | null;
      lastStatus: string | null;
      lastMessage: string | null;
    }> = [];

    let allOk = true;
    for (const [job, spec] of Object.entries(expected)) {
      const row = heartbeats.find((h) => h.jobName === job);
      if (!row) {
        reports.push({
          job,
          status: spec.required ? "missing" : "ok",
          ageSeconds: null,
          lastStatus: null,
          lastMessage: null,
        });
        if (spec.required) allOk = false;
        continue;
      }

      const ageMs = now - row.lastRunAt.getTime();
      const stale = ageMs > spec.staleAfterMs;
      const errored = row.lastStatus === "error";

      reports.push({
        job,
        status: errored ? "error" : stale ? "stale" : "ok",
        ageSeconds: Math.round(ageMs / 1000),
        lastStatus: row.lastStatus,
        lastMessage: row.lastMessage,
      });

      if (stale || errored) allOk = false;
    }

    const payload = {
      status: allOk ? "ok" : "unhealthy",
      jobs: reports,
      now: new Date().toISOString(),
    };

    return NextResponse.json(payload, { status: allOk ? 200 : 503 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }
}
