import { redirect } from "next/navigation";
import { verifyMagicLink } from "@/lib/magic-link";
import { setSession } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  const result = await verifyMagicLink(token);

  if (!result.ok) {
    const reasonToParam: Record<typeof result.reason, string> = {
      not_found: "invalid",
      used: "invalid",
      expired: "expired",
      not_allowed: "not_allowed",
    };
    redirect(`/login?error=${reasonToParam[result.reason]}`);
  }

  await setSession({ userId: result.userId, username: result.username });
  redirect("/dashboard");
}
