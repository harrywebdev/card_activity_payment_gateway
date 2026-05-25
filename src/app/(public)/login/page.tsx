import { redirect } from "next/navigation";
import { issueMagicLink } from "@/lib/magic-link";
import { BRAND_NAME } from "@/lib/config";

export const metadata = {
  title: `Přihlášení | ${BRAND_NAME}`,
};

async function requestMagicLink(formData: FormData) {
  "use server";
  const email = formData.get("email")?.toString() ?? "";
  await issueMagicLink(email);
  // Silent-success behaviour — same redirect whether or not the email
  // is on the allowlist.
  redirect("/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Přihlášení</h1>
          <p className="text-sm text-muted-foreground">
            Pošleme ti přihlašovací odkaz na e-mail. Bez hesel.
          </p>
        </header>

        {sent && (
          <div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
            Pokud je tvůj e-mail mezi povolenými, odkaz dorazil do schránky.
            Platnost 15 minut.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            {error === "invalid" && "Odkaz je neplatný nebo už použitý."}
            {error === "expired" && "Odkaz vypršel. Požádej o nový."}
            {error === "not_allowed" && "Tento e-mail nemá přístup."}
          </div>
        )}

        <form action={requestMagicLink} className="space-y-3">
          <label htmlFor="email" className="sr-only">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="tvuj@email.cz"
            autoComplete="email"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Poslat odkaz
          </button>
        </form>
      </div>
    </main>
  );
}
