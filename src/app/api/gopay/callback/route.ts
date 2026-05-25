import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * GoPay return URL. Untrusted by design — anyone could craft this URL.
 * No state mutation here; we only fetch the current subscription status
 * from our own DB (which the webhook has either updated by now, or hasn't)
 * and render a user-friendly outcome page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("sub");

  if (!subscriptionId) {
    redirect("/dashboard");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { color: true },
  });

  if (!subscription) {
    redirect("/dashboard");
  }

  // Route based on what the webhook has already done.
  if (subscription.status === "active") {
    redirect(`/dashboard?activated=${subscription.id}`);
  }

  // Still pending — webhook hasn't fired yet, or the user cancelled on GoPay.
  // Render a holding page that polls the dashboard.
  redirect(`/dashboard?pending=${subscription.id}`);
}
