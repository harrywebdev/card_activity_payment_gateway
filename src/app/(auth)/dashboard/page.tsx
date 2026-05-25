import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BRAND_NAME } from "@/lib/config";

export const metadata = {
  title: `Můj účet | ${BRAND_NAME}`,
};

export default async function DashboardPage() {
  const user = await requireUser();

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, status: { in: ["active", "pending"] } },
    include: {
      color: true,
      plans: {
        where: {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
        },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Můj účet</h1>
          <p className="text-sm text-muted-foreground">
            Přihlášen/a jako{" "}
            <span className="font-mono">{user.username}</span>
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Moje předplatné
        </h2>

        {subscriptions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Zatím nevlastníš žádný odstín.
            </p>
            <Link
              href="/colors?filter=available"
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
            >
              Prohlédnout volné odstíny
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {subscriptions.map((sub) => {
              const plan = sub.plans[0];
              const completed = plan?.completedInstalments ?? 0;
              const target = plan?.targetInstalments ?? sub.instalmentsPerMonth;
              return (
                <li key={sub.id}>
                  <Link
                    href={`/dashboard/subscriptions/${sub.id}`}
                    className="block rounded-lg border border-border p-4 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="size-12 rounded-md border border-border flex-shrink-0"
                        style={{ backgroundColor: sub.color.hex }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium capitalize truncate">
                          {sub.color.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {sub.color.hex}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">
                          {sub.monthlyAmountCzk} Kč/měs
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {completed} / {target} splátek tento měsíc
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
