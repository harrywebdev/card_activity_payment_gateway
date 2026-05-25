import { redirect } from "next/navigation";

/**
 * GoPay return URL. Untrusted by design — anyone could craft it.
 *
 * We don't read DB state here; we just bounce the user to a public result
 * page that does the lookup. The webhook (/api/gopay/notify) is the only
 * thing that mutates state.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get("sub");

  if (!subscriptionId) {
    redirect("/dashboard");
  }

  redirect(`/result?sub=${encodeURIComponent(subscriptionId)}`);
}
