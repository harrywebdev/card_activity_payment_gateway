import Link from "next/link";
import { notFound } from "next/navigation";
import { Win } from "@/components/win";
import { prisma } from "@/lib/db";
import { inkFor, formatCzk } from "@/lib/colors";

export const metadata = {
  title: "Výsledek platby | Kup si Odstín",
};

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}) {
  const { sub: subId } = await searchParams;
  if (!subId) notFound();

  const subscription = await prisma.subscription.findUnique({
    where: { id: subId },
    include: {
      color: true,
      plans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          scheduledPayments: {
            include: {
              transactions: { where: { status: "succeeded" } },
            },
          },
        },
      },
    },
  });
  if (!subscription) notFound();

  const ok = subscription.status === "active";

  // Find the first transaction (the initial one)
  const firstTx = subscription.plans[0]?.scheduledPayments
    .flatMap((sp) => sp.transactions)
    .find((t) => !!t);

  const ink = inkFor(subscription.color.hex);

  return (
    <Win title="C:\KUPSI\GOPAY.RET">
      <div
        className="stack-loose"
        style={{ maxWidth: 760, margin: "10px auto" }}
      >
        <pre
          className="ascii"
          style={{
            color: ok ? "var(--c10)" : "var(--c12)",
            fontSize: 14,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {ok
            ? `     ╔═════════════════════════════════════════════╗
     ║   PLATBA ÚSPĚŠNÁ — VÍTEJ V KLUBU 16ti       ║
     ╚═════════════════════════════════════════════╝`
            : `     ╔═════════════════════════════════════════════╗
     ║   PLATBA SE ZPRACOVÁVÁ — POČKEJ CHVÍLI      ║
     ╚═════════════════════════════════════════════╝`}
        </pre>

        {ok ? (
          <>
            <h1 className="h1">
              Hotovo.{" "}
              <span className="em" style={{ textTransform: "capitalize" }}>
                {subscription.color.name} je tvoje.
              </span>
            </h1>
            <p className="lede">
              GoPay strhlo první splátku.{" "}
              <b style={{ textTransform: "capitalize" }}>
                {subscription.color.name}
              </b>{" "}
              ti právě přiletěla na účet.
              <br />
              Od teď je u ní v katalogu tvoje přezdívka.
            </p>

            <div className="outset" style={{ padding: 0 }}>
              <div
                style={{
                  background: subscription.color.hex,
                  height: 140,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 18,
                    bottom: 14,
                    color: ink,
                    fontSize: 24,
                    lineHeight: 1,
                    textTransform: "capitalize",
                  }}
                >
                  {subscription.color.name} · {subscription.color.hex}
                </div>
              </div>
              <table className="spec">
                <tbody>
                  <tr>
                    <td>Subscription ID</td>
                    <td>{subscription.id}</td>
                  </tr>
                  {firstTx?.gopayPaymentId && (
                    <tr>
                      <td>GoPay payment ID</td>
                      <td>{firstTx.gopayPaymentId}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Měsíční částka</td>
                    <td>
                      <b>{formatCzk(subscription.monthlyAmountCzk)}</b> / měsíc
                    </td>
                  </tr>
                  <tr>
                    <td>Rozprostřeno do</td>
                    <td>{subscription.instalmentsPerMonth} splátek</td>
                  </tr>
                  <tr>
                    <td>První splátka</td>
                    <td>
                      <b>{firstTx ? formatCzk(firstTx.amountCzk) : "—"}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Doklad</td>
                    <td>poslán na tvůj e-mail</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              className="row"
              style={{ justifyContent: "center", marginTop: 8 }}
            >
              <Link className="btn btn-primary" href="/dashboard">
                ► Otevřít Můj účet
              </Link>
              <Link className="btn" href="/colors">
                Zpět na paletu
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="h1">
              Čekáme na <span className="em">potvrzení</span>.
            </h1>
            <p className="lede">
              GoPay nám ještě neposlalo finální stav. Může to trvat pár sekund.
              <br />
              Obnov stránku za chvíli, nebo mrkni do{" "}
              <Link href="/dashboard">Můj účet</Link>.
            </p>
            <div
              className="inset"
              style={{ background: "var(--c0)", color: "var(--c14)" }}
            >
              <pre style={{ margin: 0, fontSize: 13 }}>
                {`> subscription status: ${subscription.status}
> waiting for: GoPay notification webhook
> retry: refresh this page in 5–30 seconds`}
              </pre>
            </div>
            <div className="row">
              <Link className="btn btn-primary" href="/dashboard">
                ► Mrknout do účtu
              </Link>
              <Link className="btn" href="/colors">
                Zpět na paletu
              </Link>
            </div>
          </>
        )}
      </div>
    </Win>
  );
}
