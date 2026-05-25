import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function Home() {
  const totalColors = await prisma.color.count();
  const claimedColors = await prisma.color.count({
    where: { currentSubscriptionId: { not: null } },
  });
  const available = totalColors - claimedColors;

  return (
    <main className="mx-auto max-w-3xl px-6 py-20 space-y-10">
      <section className="space-y-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">
          Vlastni jednu barvu.
        </h1>
        <p className="text-xl text-muted-foreground">
          Z katalogu {totalColors.toLocaleString("cs-CZ")} odstínů si vyber jeden
          a získej ho na své jméno. Splácej ho v měsíčních splátkách.
        </p>
        <p className="text-sm text-muted-foreground">
          {available.toLocaleString("cs-CZ")} odstínů zatím bez majitele.
        </p>
      </section>

      <div className="flex items-center justify-center gap-3">
        <Link
          href="/colors"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
        >
          Procházet katalog
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted transition"
        >
          Přihlásit se
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm text-muted-foreground border-t border-border pt-10">
        <div>
          <h2 className="font-medium text-foreground mb-1">Jeden majitel</h2>
          Každý odstín může v daný okamžik vlastnit pouze jeden účet.
        </div>
        <div>
          <h2 className="font-medium text-foreground mb-1">Splátky</h2>
          Cenu si nastavíš sám. Rozložíš ji do tolika splátek, kolik chceš.
        </div>
        <div>
          <h2 className="font-medium text-foreground mb-1">Bez závazku</h2>
          Kdykoli můžeš odstín pustit a uvolnit ho dalším.
        </div>
      </section>
    </main>
  );
}
