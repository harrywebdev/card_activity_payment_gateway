import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron, recordHeartbeat } from "@/lib/cron";
import { sendTelegram } from "@/lib/telegram";
import {
  tplDailySummary,
  tplMonthlyRecap,
  type SubProgress,
  type MonthSubProgress,
} from "@/lib/telegram-templates";

/**
 * POST /api/cron/daily-summary
 *
 * Triggered by Disco at 21:00 every day.
 *
 * Always:
 *   - Computes today's per-subscription charges (success/failure).
 *   - If any active subscription exists, posts a daily digest to Telegram.
 *
 * On the 1st of the month:
 *   - Also posts a separate "Monthly recap" message looking back at the
 *     previous month's outcomes per subscription (charged or failed).
 *
 * Heartbeat is written even if nothing happened, so /api/healthz can
 * vouch for the cron chain regardless.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    const activeSubs = await prisma.subscription.findMany({
      where: { status: "active" },
      include: {
        color: true,
        user: { select: { username: true } },
        scheduledPayments: {
          where: { year: thisYear, month: thisMonth },
          take: 1,
        },
      },
    });

    const progress: SubProgress[] = [];
    let dailySuccessTotal = 0;
    let dailyFailedTotal = 0;

    for (const sub of activeSubs) {
      const thisMonthRow = sub.scheduledPayments[0];
      const thisMonthStatus = thisMonthRow?.status ?? "missing";

      const todayTx = await prisma.transaction.findMany({
        where: {
          executedAt: { gte: dayStart, lt: dayEnd },
          scheduledPayment: { subscriptionId: sub.id },
        },
        select: { status: true, amountCzk: true },
      });
      const todaySuccess = todayTx.filter(
        (t) => t.status === "succeeded",
      ).length;
      const todayFail = todayTx.filter((t) => t.status === "failed").length;
      const todayAmount = todayTx
        .filter((t) => t.status === "succeeded")
        .reduce((a, t) => a + t.amountCzk, 0);

      dailySuccessTotal += todaySuccess;
      dailyFailedTotal += todayFail;

      progress.push({
        color: { name: sub.color.name, hex: sub.color.hex },
        username: sub.user.username,
        todaySuccess,
        todayFailed: todayFail,
        todayAmountCzk: todayAmount,
        thisMonthStatus,
      });
    }

    const dailyMessage = tplDailySummary({
      date: now,
      subs: progress,
      totalSuccess: dailySuccessTotal,
      totalFailed: dailyFailedTotal,
    });
    if (dailyMessage) {
      try {
        await sendTelegram(dailyMessage);
      } catch (e) {
        console.error("Telegram daily summary failed (non-fatal):", e);
      }
    }

    // ── Monthly recap on the 1st ──
    let monthlyMessageSent = false;
    if (now.getDate() === 1) {
      const lastMonthDate = new Date(thisYear, thisMonth - 2, 1);
      const lastYear = lastMonthDate.getFullYear();
      const lastMonth = lastMonthDate.getMonth() + 1;

      const lastMonthCharges = await prisma.scheduledPayment.findMany({
        where: { year: lastYear, month: lastMonth },
        include: {
          subscription: {
            include: {
              color: true,
              user: { select: { username: true } },
            },
          },
          transactions: { where: { status: "succeeded" } },
        },
      });

      const monthProgress: MonthSubProgress[] = lastMonthCharges.map((sp) => {
        const amount = sp.transactions.reduce((a, t) => a + t.amountCzk, 0);
        return {
          color: {
            name: sp.subscription.color.name,
            hex: sp.subscription.color.hex,
          },
          username: sp.subscription.user.username,
          status: sp.status,
          amountCzk: amount,
        };
      });

      const recap = tplMonthlyRecap({
        monthDate: lastMonthDate,
        subs: monthProgress,
      });
      if (recap) {
        try {
          await sendTelegram(recap);
          monthlyMessageSent = true;
        } catch (e) {
          console.error("Telegram monthly recap failed (non-fatal):", e);
        }
      }
    }

    await recordHeartbeat(
      "daily_summary",
      "ok",
      `subs=${activeSubs.length} success=${dailySuccessTotal} failed=${dailyFailedTotal} recap=${monthlyMessageSent}`,
    );

    return NextResponse.json({
      ok: true,
      subscriptions: activeSubs.length,
      dailySuccess: dailySuccessTotal,
      dailyFailed: dailyFailedTotal,
      monthlyRecapSent: monthlyMessageSent,
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
