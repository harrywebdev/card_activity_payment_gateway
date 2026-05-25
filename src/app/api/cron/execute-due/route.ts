import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron, recordHeartbeat } from "@/lib/cron";
import { createRecurrence } from "@/lib/gopay";
import { EXECUTOR } from "@/lib/config";
import { sendTelegram } from "@/lib/telegram";
import {
  tplInstalmentSuccess,
  tplInstalmentFailure,
  tplExecutorError,
} from "@/lib/telegram-templates";

const BATCH_SIZE = 50;

/**
 * POST /api/cron/execute-due
 *
 * Picks ScheduledPayments where scheduledAt <= now() AND status=pending,
 * fires them against GoPay via MIT createRecurrence, records outcomes.
 *
 * Retry policy: on transient failure, increment attempts, push scheduledAt
 * forward by EXECUTOR.retryBackoffMinutes[attempts-1] minutes, status stays
 * pending. After EXECUTOR.maxAttempts attempts: status=failed, Telegram alert.
 *
 * The heartbeat row is written on every run regardless of whether any
 * payments were due — that's the point: /api/healthz uses its freshness
 * to prove the Disco → script → wget → route chain is alive.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let processed = 0;
  let succeeded = 0;
  let retried = 0;
  let failed = 0;

  try {
    const now = new Date();
    const due = await prisma.scheduledPayment.findMany({
      where: { status: "pending", scheduledAt: { lte: now } },
      include: {
        subscriptionPlan: {
          include: {
            subscription: {
              include: { color: true, user: true, paymentMethod: true },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: BATCH_SIZE,
    });

    for (const sp of due) {
      // Optimistic claim — if a parallel runner got this row first, skip it.
      const claim = await prisma.scheduledPayment.updateMany({
        where: { id: sp.id, status: "pending" },
        data: { status: "in_progress" },
      });
      if (claim.count === 0) continue;
      processed++;

      const sub = sp.subscriptionPlan.subscription;
      const pm = sub.paymentMethod;

      // Defensive: a pending ScheduledPayment without a saved PaymentMethod
      // should never happen post-activation, but guard anyway.
      if (!pm || sub.status !== "active") {
        await prisma.scheduledPayment.update({
          where: { id: sp.id },
          data: {
            status: "failed",
            attempts: sp.attempts + 1,
            lastError: "subscription_not_active_or_no_payment_method",
          },
        });
        failed++;
        continue;
      }

      const orderNumber = `sub_${sub.id}_inst_${sp.subscriptionPlan.completedInstalments + 1}_of_${sub.instalmentsPerMonth}`;
      const orderDescription = `${sub.color.name} (${sub.color.hex}) — splátka ${sp.subscriptionPlan.completedInstalments + 1}/${sub.instalmentsPerMonth}`;

      try {
        const recurrence = await createRecurrence(pm.gopayPaymentId, {
          amountCzk: sp.amountCzk,
          orderNumber,
          orderDescription,
        });

        const isPaid = recurrence.state === "PAID";
        if (!isPaid) {
          throw new Error(`recurrence state was ${recurrence.state}`);
        }

        await prisma.$transaction(async (tx) => {
          await tx.scheduledPayment.update({
            where: { id: sp.id },
            data: { status: "succeeded", attempts: sp.attempts + 1 },
          });
          await tx.transaction.create({
            data: {
              scheduledPaymentId: sp.id,
              amountCzk: sp.amountCzk,
              status: "succeeded",
              gopayPaymentId: String(recurrence.id),
              executedAt: new Date(),
            },
          });
          await tx.subscriptionPlan.update({
            where: { id: sp.subscriptionPlanId },
            data: { completedInstalments: { increment: 1 } },
          });
        });

        succeeded++;

        try {
          await sendTelegram(
            tplInstalmentSuccess({
              color: sub.color,
              username: sub.user.username,
              amountCzk: sp.amountCzk,
              instalmentNumber: sp.subscriptionPlan.completedInstalments + 1,
              instalmentsPerMonth: sub.instalmentsPerMonth,
            }),
          );
        } catch (telegramErr) {
          console.error("Telegram per-tx failed (non-fatal):", telegramErr);
        }
      } catch (e) {
        const errMessage = e instanceof Error ? e.message : String(e);
        const newAttempts = sp.attempts + 1;
        const exhausted = newAttempts >= EXECUTOR.maxAttempts;

        if (exhausted) {
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: "failed",
              attempts: newAttempts,
              lastError: errMessage,
            },
          });
          await prisma.transaction.create({
            data: {
              scheduledPaymentId: sp.id,
              amountCzk: sp.amountCzk,
              status: "failed",
              error: errMessage,
              executedAt: new Date(),
            },
          });
          failed++;

          try {
            await sendTelegram(
              tplInstalmentFailure({
                color: sub.color,
                username: sub.user.username,
                amountCzk: sp.amountCzk,
                attempts: newAttempts,
                error: errMessage,
              }),
            );
          } catch (telegramErr) {
            console.error("Telegram failure alert failed:", telegramErr);
          }
        } else {
          const backoffMin = EXECUTOR.retryBackoffMinutes[newAttempts - 1] ?? 60;
          const nextAt = new Date(Date.now() + backoffMin * 60_000);
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: "pending",
              attempts: newAttempts,
              lastError: errMessage,
              scheduledAt: nextAt,
            },
          });
          retried++;
        }
      }
    }

    await recordHeartbeat(
      "executor",
      "ok",
      `processed=${processed} succeeded=${succeeded} retried=${retried} failed=${failed}`,
    );
    return NextResponse.json({
      ok: true,
      processed,
      succeeded,
      retried,
      failed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordHeartbeat("executor", "error", message).catch(() => {});
    try {
      await sendTelegram(tplExecutorError(message));
    } catch (telegramErr) {
      console.error("Telegram executor-error alert failed:", telegramErr);
    }
    return NextResponse.json(
      { error: "executor_failed", message, processed, succeeded, retried, failed },
      { status: 500 },
    );
  }
}
