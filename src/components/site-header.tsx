import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/config";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight text-lg">
          {BRAND_NAME}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/colors" className="text-muted-foreground hover:text-foreground transition">
            Katalog
          </Link>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground transition"
              >
                Můj účet
              </Link>
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs">
                {user.username}
              </span>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  Odhlásit
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90 transition"
            >
              Přihlásit
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
