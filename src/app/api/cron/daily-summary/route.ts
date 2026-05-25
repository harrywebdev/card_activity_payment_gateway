import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron, recordHeartbeat } from "@/lib/cron";
import { sendTelegram } from "@/lib/telegram";

/**
 * POST /api/cron/daily-summary
 *
 * Triggered by Disco at 21:00 every day. Computes today's per-subscription
 * progress and posts a digest to Telegram. Heartbeat is written even if
 * nothing happened (so healthcheck can vouch for the cron chain).
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const activeSubs = await prisma.subscription.findMany({
      where: { status: "active" },
      include: {
        color: true,
        user: { select: { username: true } },
        plans: { where: { year, month }, take: 1 },
      },
    });

    const lines: string[] = [];
    let dailySuccessTotal = 0;
    let dailyFailedTotal = 0;

    for (const sub of activeSubs) {
      const plan = sub.plans[0];
      const completedThisMonth = plan?.completedInstalments ?? 0;
      const targetThisMonth = plan?.targetInstalments ?? sub.instalmentsPerMonth;

      const todayTx = await prisma.transaction.findMany({
        where: {
          executedAt: { gte: dayStart, lt: dayEnd },
          scheduledPayment: { subscriptionPlan: { subscriptionId: sub.id } },
        },
        select: { status: true, amountCzk: true },
      });
      const todaySuccess = todayTx.filter((t) => t.status === "succeeded").length;
      const todayFail = todayTx.filter((t) => t.status === "failed").length;
      const todayAmount = todayTx
        .filter((t) => t.status === "succeeded")
        .reduce((a, t) => a + t.amountCzk, 0);

      dailySuccessTotal += todaySuccess;
      dailyFailedTotal += todayFail;

      const flag = todayFail > 0 ? "⚠️ " : todaySuccess > 0 ? "✅ " : "·  ";
      lines.push(
        `${flag}<b>${sub.color.name}</b> <code>${sub.color.hex}</code> — ` +
          `${sub.user.username}: dnes ${todaySuccess} (${todayAmount} CZK)` +
          (todayFail > 0 ? `, selhalo ${todayFail}` : "") +
          ` · měsíc ${completedThisMonth}/${targetThisMonth}`,
      );
    }

    if (activeSubs.length > 0) {
      const header = `📊 Denní souhrn — ${new Date().toLocaleDateString("cs-CZ")}\n${dailySuccessTotal} úspěšných, ${dailyFailedTotal} neúspěšných napříč ${activeSubs.length} odstíny`;
      const body = lines.join("\n");

      try {
        await sendTelegram(`${header}\n\n${body}`);
      } catch (e) {
        console.error("Telegram daily summary failed (non-fatal):", e);
      }
    }

    await recordHeartbeat(
      "daily_summary",
      "ok",
      `subs=${activeSubs.length} success=${dailySuccessTotal} failed=${dailyFailedTotal}`,
    );

    return NextResponse.json({
      ok: true,
      subscriptions: activeSubs.length,
      dailySuccess: dailySuccessTotal,
      dailyFailed: dailyFailedTotal,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordHeartbeat("daily_summary", "error", message).catch(() => {});
    return NextResponse.json(
      { error: "daily_summary_failed", message },
      { status: 500 },
    );
  }
}
