import Link from "next/link";
import { Win } from "@/components/win";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCzk } from "@/lib/colors";

export const metadata = {
  title: "Můj účet | Kup si Odstín",
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const filled = "█".repeat(Math.max(0, Math.min(total, done)));
  const empty = "░".repeat(Math.max(0, total - done));
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 13,
        color: "var(--c0)",
        fontFamily: "var(--font-mono)",
        lineHeight: 1.05,
      }}
    >
      {`[${filled}${empty}] ${done}/${total}`}
    </pre>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; pending?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  // Email lookup for the header
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, createdAt: true },
  });

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

  const totalMonthly = subscriptions
    .filter((s) => s.status === "active")
    .reduce((acc, s) => acc + s.monthlyAmountCzk, 0);

  const activeCount = subscriptions.filter((s) => s.status === "active").length;

  // Next charge — next 1st of month
  const now = new Date();
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysToNext = Math.ceil(
    (nextFirst.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <Win title="C:\KUPSI\UCET.EXE">
      <div className="stack-loose">
        {sp.activated && (
          <div className="outset" style={{ padding: 0 }}>
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c10)",
                padding: "4px 12px",
                fontSize: 13,
              }}
            >
              ── PŘIPSÁNO ────────────────────────────────
            </div>
            <div style={{ padding: "14px 18px", fontSize: 15 }}>
              ✅ Předplatné je aktivní. První splátka prošla, ostatní jsou
              naplánované.
            </div>
          </div>
        )}
        {sp.pending && (
          <div className="outset" style={{ padding: 0 }}>
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c14)",
                padding: "4px 12px",
                fontSize: 13,
              }}
            >
              ── ČEKÁME NA POTVRZENÍ ────────────────────
            </div>
            <div style={{ padding: "14px 18px", fontSize: 15 }}>
              ⏳ Platba se zpracovává. Obnov stránku za chvíli.
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="h1" style={{ marginBottom: 4 }}>
              Ahoj, <span className="em">@{user.username}</span>.
            </h1>
            <p className="muted" style={{ fontSize: 15, margin: 0 }}>
              Přihlášen jako <b>{userRow.email}</b> · účet od{" "}
              <b>{userRow.createdAt.toLocaleDateString("cs-CZ")}</b>.
            </p>
          </div>
          <div className="row">
            <Link className="btn" href="/colors">
              ► Otevřít katalog
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="btn btn-danger" type="submit">
                Odhlásit
              </button>
            </form>
          </div>
        </div>

        <hr className="solid" />

        <div className="grid-3">
          <div className="outset stack-tight">
            <div className="tag">VLASTNÍŠ</div>
            <div style={{ fontSize: 36, lineHeight: 1, color: "var(--c0)" }}>
              {activeCount}{" "}
              <span style={{ color: "var(--c8)", fontSize: 16 }}>/ 16</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              barev z palety
            </p>
          </div>
          <div className="outset stack-tight">
            <div className="tag">MĚSÍČNĚ</div>
            <div style={{ fontSize: 36, lineHeight: 1, color: "var(--c0)" }}>
              {formatCzk(totalMonthly)}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              napříč {activeCount} {activeCount === 1 ? "odstínem" : "odstíny"}
            </p>
          </div>
          <div className="outset stack-tight">
            <div className="tag">PŘÍŠTÍ MĚSÍC</div>
            <div style={{ fontSize: 36, lineHeight: 1, color: "var(--c0)" }}>
              1.&nbsp;{nextFirst.getMonth() + 1}.
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {nextFirst.getFullYear()} (za {daysToNext}{" "}
              {daysToNext === 1 ? "den" : daysToNext < 5 ? "dny" : "dnů"})
            </p>
          </div>
        </div>

        <h2 className="h2">Moje barvy</h2>

        {subscriptions.length === 0 ? (
          <div className="inset center" style={{ padding: "40px 20px" }}>
            <pre
              className="ascii"
              style={{ color: "var(--c8)", margin: "0 0 14px" }}
            >
              {`     ┌──────────────┐
     │              │
     │   ŽÁDNÁ      │
     │   BARVA      │
     │              │
     └──────────────┘`}
            </pre>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Zatím <b>nevlastníš žádný odstín</b>.
              <br />
              Ale 16 z nich jen čeká, až si je vezmeš.
            </p>
            <Link
              className="btn btn-primary"
              href="/colors?filter=free"
              style={{ marginTop: 10 }}
            >
              ► Prohlédnout volné odstíny
            </Link>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--c0)", color: "var(--c14)" }}>
                <th style={{ textAlign: "left", padding: "4px 10px" }}>
                  Barva
                </th>
                <th style={{ textAlign: "left", padding: "4px 10px" }}>Hex</th>
                <th style={{ textAlign: "left", padding: "4px 10px" }}>
                  Tento měsíc
                </th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>
                  Měsíčně
                </th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>
                  Stav
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => {
                const plan = sub.plans[0];
                const done = plan?.completedInstalments ?? 0;
                const total =
                  plan?.targetInstalments ?? sub.instalmentsPerMonth;
                return (
                  <tr
                    key={sub.id}
                    style={{ borderBottom: "1px dashed var(--c8)" }}
                  >
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 28,
                          height: 28,
                          background: sub.color.hex,
                          border: "2px solid var(--c0)",
                          verticalAlign: "middle",
                          marginRight: 10,
                        }}
                      />
                      <Link
                        href={`/colors/${sub.color.hex.replace("#", "")}`}
                        style={{
                          color: "var(--c1)",
                          fontWeight: "bold",
                          textTransform: "capitalize",
                        }}
                      >
                        {sub.color.name}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>{sub.color.hex}</td>
                    <td style={{ padding: "10px" }}>
                      <ProgressBar done={done} total={total} />
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <b>{formatCzk(sub.monthlyAmountCzk)}</b>
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <span
                        className={
                          "tag " +
                          (sub.status === "active"
                            ? "ok"
                            : sub.status === "pending"
                              ? "warn"
                              : "err")
                        }
                      >
                        {sub.status === "active"
                          ? "AKTIVNÍ"
                          : sub.status === "pending"
                            ? "ČEKÁ"
                            : "ZRUŠENO"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <hr className="dash" />

        <div className="grid-2">
          <div>
            <h3 className="h3">Platby & doklady</h3>
            <p style={{ fontSize: 15, color: "var(--c0)", margin: 0 }}>
              Strhujeme přes GoPay průběžně během měsíce,
              <br />
              splátky jsou rozprostřené přirozeně.
              <br />
              Když platba selže 3× po sobě, dáme vědět.
            </p>
          </div>
          <div>
            <h3 className="h3">Něco se rozbilo?</h3>
            <p style={{ fontSize: 15, color: "var(--c0)", margin: 0 }}>
              Napiš na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>.
              <br />
              Pokud máš barvu a rozhodneš se ji pustit, napiš mail.
            </p>
          </div>
        </div>
      </div>
    </Win>
  );
}
