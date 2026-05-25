import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron, recordHeartbeat } from "@/lib/cron";
import { planSubscriptionForMonth } from "@/lib/planner";
import { sendTelegram } from "@/lib/telegram";
import { tplPlannerError } from "@/lib/telegram-templates";

/**
 * POST /api/cron/plan-month
 *
 * For every active subscription, generates this month's SubscriptionPlan
 * + ScheduledPayments if one doesn't already exist. Idempotent — safe to
 * run more than once.
 *
 * Triggered by Disco's planner cron service via scripts/cron-plan-month.sh
 * on the 1st of each month at 00:00, but also useful to run manually if
 * a deploy happens mid-month and a freshly-active subscription needs its
 * plan filled in.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const active = await prisma.subscription.findMany({
      where: { status: "active" },
      select: {
        id: true,
        monthlyAmountCzk: true,
        instalmentsPerMonth: true,
      },
    });

    let created = 0;
    let skipped = 0;
    for (const sub of active) {
      const { created: wasCreated } = await planSubscriptionForMonth({
        subscriptionId: sub.id,
        monthlyAmountCzk: sub.monthlyAmountCzk,
        instalmentsPerMonth: sub.instalmentsPerMonth,
        // Mid-month invocations of the planner shouldn't pretend any
        // instalments have already happened; the executor's own logic
        // tracks completedInstalments accurately.
        alreadyCompleted: 0,
      });
      if (wasCreated) created++;
      else skipped++;
    }

    await recordHeartbeat(
      "planner",
      "ok",
      `created=${created} skipped=${skipped}`,
    );
    return NextResponse.json({
      ok: true,
      created,
      skipped,
      total: active.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordHeartbeat("planner", "error", message).catch(() => {});
    try {
      await sendTelegram(tplPlannerError(message));
    } catch (telegramErr) {
      console.error("Telegram planner-error alert failed:", telegramErr);
    }
    return NextResponse.json(
      { error: "planner_failed", message },
      { status: 500 },
    );
  }
}
