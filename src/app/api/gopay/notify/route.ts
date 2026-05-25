import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentStatus } from "@/lib/gopay";
import { planSubscriptionForMonth, splitAmount } from "@/lib/planner";
import { sendTelegram } from "@/lib/telegram";

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
    return handleInitialEnrolmentNotification(subscription, status, String(paymentId));
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
  status: { state: string; payer?: { payment_card?: { card_number?: string; issuer_bank?: string } } },
  gopayPaymentId: string,
) {
  // Already activated — webhook is being retried; just ack.
  if (subscription.status === "active") {
    return NextResponse.json({ ok: true, kind: "already_active" });
  }

  if (status.state !== "PAID") {
    // Cancelled / timeouted / etc. — leave the subscription pending; the
    // user can retry from the colour detail page.
    return NextResponse.json({ ok: true, kind: "not_paid", state: status.state });
  }

  const lastFour = extractLastFour(status.payer?.payment_card?.card_number);
  const bankName = status.payer?.payment_card?.issuer_bank ?? null;
  const firstAmounts = splitAmount(
    subscription.monthlyAmountCzk,
    subscription.instalmentsPerMonth,
  );
  const firstAmount = firstAmounts[0];

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
        startedAt: new Date(),
        paymentMethodId: paymentMethod.id,
      },
    });

    await tx.color.update({
      where: { id: subscription.colorId },
      data: { currentSubscriptionId: subscription.id },
    });

    return { paymentMethodId: paymentMethod.id };
  });

  // Plan the remaining instalments for this month. The initial payment
  // counts as instalment 1, so alreadyCompleted=1.
  const { planId } = await planSubscriptionForMonth({
    subscriptionId: subscription.id,
    monthlyAmountCzk: subscription.monthlyAmountCzk,
    instalmentsPerMonth: subscription.instalmentsPerMonth,
    alreadyCompleted: 1,
  });

  // Synthesise a "succeeded at creation" ScheduledPayment to parent the
  // first Transaction onto.
  const firstScheduled = await prisma.scheduledPayment.create({
    data: {
      subscriptionPlanId: planId,
      amountCzk: firstAmount,
      scheduledAt: new Date(),
      status: "succeeded",
      attempts: 1,
    },
  });

  await prisma.transaction.create({
    data: {
      scheduledPaymentId: firstScheduled.id,
      amountCzk: firstAmount,
      status: "succeeded",
      gopayPaymentId,
      executedAt: new Date(),
    },
  });

  try {
    await sendTelegram(
      `🎨 Nové předplatné: <b>${subscription.color.name}</b> (${subscription.color.hex}) — ` +
        `${subscription.user.username}, ${subscription.monthlyAmountCzk} CZK/měs ` +
        `v ${subscription.instalmentsPerMonth} splátkách. První splátka ${firstAmount} CZK proběhla.`,
    );
  } catch (e) {
    console.error("Telegram notify failed (non-fatal):", e);
  }

  return NextResponse.json({
    ok: true,
    kind: "activated",
    subscriptionId: subscription.id,
    paymentMethodId: result.paymentMethodId,
    planId,
  });
}

function extractLastFour(masked?: string): string | null {
  if (!masked) return null;
  const last4 = masked.replace(/[^0-9]/g, "").slice(-4);
  return last4.length === 4 ? last4 : null;
}
