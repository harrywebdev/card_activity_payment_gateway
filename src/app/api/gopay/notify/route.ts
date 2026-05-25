import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentStatus } from "@/lib/gopay";
import { planSubscriptionForMonth, splitAmount } from "@/lib/planner";
import { sendTelegram } from "@/lib/telegram";

/**
 * GoPay server-to-server notification. Body shape from GoPay is just the
 * payment id (POSTed as form data with key `id`, or as `?id=` in the query
 * string depending on the request). We do NOT trust the payload — we look
 * up the payment by id, refetch its status from GoPay, and act on that.
 *
 * GoPay does not sign notifications; the contract is "we tell you the id,
 * you ask us for the status". Idempotent by design.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let paymentId = url.searchParams.get("id");
  if (!paymentId) {
    try {
      const form = await req.formData();
      paymentId = form.get("id")?.toString() ?? null;
    } catch {
      // ignore — not form-encoded
    }
  }
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

  // Find the matching pending subscription (initial enrolment) OR the
  // existing one whose payment_method.gopayPaymentId matches (a recurrence).
  const subscription = await prisma.subscription.findUnique({
    where: { initialGopayPaymentId: String(paymentId) },
    include: { color: true, user: true, paymentMethod: true },
  });

  if (subscription) {
    return handleInitialEnrolmentNotification(subscription, status, String(paymentId));
  }

  // Otherwise this is likely a recurrence notification — look up the
  // matching transaction by gopayPaymentId and update its status. (Executor
  // already does this synchronously when it calls createRecurrence, but
  // we acknowledge here for completeness.)
  const tx = await prisma.transaction.findFirst({
    where: { gopayPaymentId: String(paymentId) },
  });
  if (tx) {
    // The executor records final state inline; nothing to do here.
    return NextResponse.json({ ok: true, kind: "recurrence_ack" });
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

  // Atomic activation:
  // 1. Create PaymentMethod with the saved card token (= initialGopayPaymentId).
  // 2. Link Subscription → PaymentMethod, set status=active, startedAt=now.
  // 3. Set Color.currentSubscriptionId.
  // 4. Create this month's SubscriptionPlan + remaining ScheduledPayments.
  // 5. Record the first Transaction.

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

  // Find the freshly created plan to attach the first Transaction to.
  // We need a ScheduledPayment row for the first instalment too so the
  // Transaction has a parent; we create a synthetic "completed at creation"
  // ScheduledPayment for it.
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

  // Telegram ping (best-effort).
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
