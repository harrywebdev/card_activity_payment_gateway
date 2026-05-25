import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createPayment } from "@/lib/gopay";
import { splitAmount } from "@/lib/planner";
import { env } from "@/lib/config";

function back(hex: string, error: string) {
  redirect(`/subscribe/${hex.replace("#", "")}?error=${error}`);
}

export async function POST(req: Request) {
  const user = await requireUser();

  const form = await req.formData();
  const hex = form.get("hex")?.toString().toLowerCase() ?? "";
  const monthlyAmountCzk = Number.parseInt(
    form.get("monthlyAmountCzk")?.toString() ?? "",
    10,
  );
  const instalmentsPerMonth = Number.parseInt(
    form.get("instalmentsPerMonth")?.toString() ?? "",
    10,
  );

  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    redirect("/colors");
  }
  if (!Number.isFinite(monthlyAmountCzk) || monthlyAmountCzk < 1 || monthlyAmountCzk > 100_000) {
    back(hex, "invalid_amount");
  }
  if (!Number.isFinite(instalmentsPerMonth) || instalmentsPerMonth < 1 || instalmentsPerMonth > 31) {
    back(hex, "invalid_instalments");
  }
  // GoPay's effective minimum per charge is 1 CZK — card networks reject
  // sub-koruna amounts in practice. The client form prevents this, but
  // re-check on the server in case someone hand-crafts the POST.
  if (monthlyAmountCzk < instalmentsPerMonth) {
    back(hex, "instalment_too_small");
  }

  const color = await prisma.color.findUnique({ where: { hex } });
  if (!color) redirect("/colors");
  if (color.currentSubscriptionId) back(hex, "color_taken");

  // Prevent the same user from holding multiple active/pending subs on one color.
  const dupe = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      colorId: color.id,
      status: { in: ["pending", "active"] },
    },
  });
  if (dupe) back(hex, "already_subscribed");

  // Need the email for the GoPay contact field; requireUser only returns id+username.
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true },
  });

  // Create the Subscription in `pending` state. We don't yet have a GoPay
  // payment id; we'll set initialGopayPaymentId immediately after createPayment.
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      colorId: color.id,
      monthlyAmountCzk,
      instalmentsPerMonth,
      status: "pending",
    },
  });

  // First instalment amount (others are determined at planning time).
  const instalmentAmounts = splitAmount(monthlyAmountCzk, instalmentsPerMonth);
  const firstAmount = instalmentAmounts[0];

  const orderNumber = `sub_${subscription.id}_inst_1_of_${instalmentsPerMonth}`;
  const orderDescription = `${color.name} (${color.hex}) — splátka 1/${instalmentsPerMonth}`;

  let payment;
  try {
    payment = await createPayment({
      email: userRow.email,
      amountCzk: firstAmount,
      orderNumber,
      orderDescription,
      returnUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/gopay/callback?sub=${subscription.id}`,
      notificationUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/gopay/notify`,
      recurrence: "ON_DEMAND",
    });
  } catch (e) {
    console.error("createPayment failed", e);
    // Roll back the pending subscription so the user can retry cleanly.
    await prisma.subscription.delete({ where: { id: subscription.id } });
    back(hex, "gopay");
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { initialGopayPaymentId: String(payment!.id) },
  });

  // Redirect the browser to GoPay's hosted page.
  redirect(payment!.gw_url);
}
