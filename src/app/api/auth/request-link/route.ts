import { redirect } from "next/navigation";
import { issueMagicLink } from "@/lib/magic-link";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = form.get("email")?.toString() ?? "";

  // Silent-success: issueMagicLink itself decides whether to do anything
  // based on the allowlist. The UX response is identical either way.
  await issueMagicLink(email);

  redirect("/login?sent=1");
}
