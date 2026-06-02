import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentStatus } from "@/lib/gopay";
import { sendTelegram } from "@/lib/telegram";
import { tplActivation } from "@/lib/telegram-templates";

/**
 * GoPay server-to-server notification.
 *
 * Per doc.gopay.cz/#odeslani-notifikace:
 * - HTTP GET (not POST)
 * - Query params: `id` (payment id) and on recurrence webhooks `parent_id`
 *   (id of the originating ON_DEMAND payment)
 * - The notification carries no state — we MUST refetch payment status by id
 *   to learn what actually happened. Idempotent by design.
 * - No signature header. Security model is "id arrives, you fetch status".
 *   For optional hardening you can IP-allowlist GoPay's notification IPs:
 *     prod:    52.28.190.73, 52.28.96.25, 54.93.75.231, 54.93.48.200
 *     sandbox: 18.158.112.17, 18.199.189.118, 3.70.41.70
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("id");
  // parent_id is supplied on recurrence webhooks; we accept it for logging
  // but don't strictly need it (the transaction row already references the
  // PaymentMethod through scheduledPayment).
  const parentId = url.searchParams.get("parent_id");

  if (!paymentId) {
    return NextResponse.json({ error: "missing payment id" }, { status: 400 });
  }

  let status;
  try {
    status = await getPaymentStatus(paymentId);
  } catch (e) {
    console.error("gopay.getPaymentStatus failed in webhook", e);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 502 });
  }

  // Initial-enrolment notification: we recorded initialGopayPaymentId
  // immediately after createPayment, so this lookup finds the pending sub.
  const subscription = await prisma.subscription.findUnique({
    where: { initialGopayPaymentId: String(paymentId) },
    include: { color: true, user: true, paymentMethod: true },
  });

  if (subscription) {
    return handleInitialEnrolmentNotification(
      subscription,
      status,
      String(paymentId),
    );
  }

  // Otherwise: a recurrence (MIT) notification. The executor records final
  // state inline when it calls createRecurrence, so this is just an ack —
  // we log parent_id for traceability if we want to correlate to a saved
  // PaymentMethod later.
  if (parentId) {
    const tx = await prisma.transaction.findFirst({
      where: { gopayPaymentId: String(paymentId) },
    });
    if (tx) {
      return NextResponse.json({ ok: true, kind: "recurrence_ack" });
    }
  }

  return NextResponse.json({ ok: true, kind: "unknown_payment_ignored" });
}

async function handleInitialEnrolmentNotification(
  subscription: NonNullable<
    Awaited<ReturnType<typeof prisma.subscription.findUnique>>
  > & {
    color: { id: string; hex: string; name: string };
    user: { username: string; email: string };
    paymentMethod: { id: string; gopayPaymentId: string } | null;
  },
  status: {
    state: string;
    payer?: { payment_card?: { card_number?: string; issuer_bank?: string } };
  },
  gopayPaymentId: string,
) {
  // Already activated — webhook is being retried; just ack.
  if (subscription.status === "active") {
    return NextResponse.json({ ok: true, kind: "already_active" });
  }

  if (status.state !== "PAID") {
    // Cancelled / timeouted / etc. — leave the subscription pending; the
    // user can retry from the colour detail page.
    return NextResponse.json({
      ok: true,
      kind: "not_paid",
      state: status.state,
    });
  }

  const lastFour = extractLastFour(status.payer?.payment_card?.card_number);
  const bankName = status.payer?.payment_card?.issuer_bank ?? null;

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const paymentMethod = await tx.paymentMethod.create({
      data: {
        userId: subscription.userId,
        gopayPaymentId,
        lastFour,
        bankName,
        status: "active",
      },
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "active",
        startedAt: now,
        paymentMethodId: paymentMethod.id,
      },
    });

    await tx.color.update({
      where: { id: subscription.colorId },
      data: { currentSubscriptionId: subscription.id },
    });

    // Record this month's charge — the initial payment via GoPay's hosted
    // page covers the current month, so we mark its ScheduledPayment as
    // succeeded straight away and parent the Transaction onto it. The
    // monthly planner will schedule next month's charge on the 1st.
    const sp = await tx.scheduledPayment.create({
      data: {
        subscriptionId: subscription.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amountCzk: subscription.monthlyAmountCzk,
        scheduledAt: now,
        status: "succeeded",
        attempts: 1,
      },
    });

    await tx.transaction.create({
      data: {
        scheduledPaymentId: sp.id,
        amountCzk: subscription.monthlyAmountCzk,
        status: "succeeded",
        gopayPaymentId,
        executedAt: now,
      },
    });

    return { paymentMethodId: paymentMethod.id, scheduledPaymentId: sp.id };
  });

  try {
    await sendTelegram(
      tplActivation({
        color: subscription.color,
        username: subscription.user.username,
        monthlyAmountCzk: subscription.monthlyAmountCzk,
      }),
    );
  } catch (e) {
    console.error("Telegram notify failed (non-fatal):", e);
  }

  return NextResponse.json({
    ok: true,
    kind: "activated",
    subscriptionId: subscription.id,
    paymentMethodId: result.paymentMethodId,
    scheduledPaymentId: result.scheduledPaymentId,
  });
}

function extractLastFour(masked?: string): string | null {
  if (!masked) return null;
  const last4 = masked.replace(/[^0-9]/g, "").slice(-4);
  return last4.length === 4 ? last4 : null;
}
