import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Win } from "@/components/win";
import { requireUser } from "@/lib/auth";
import {
  getColorByHex,
  inkFor,
  cgaMetaForHex,
  formatCzk,
} from "@/lib/colors";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hex: string }>;
}) {
  const { hex } = await params;
  return { title: `Koupit odstín #${hex} | Kup si Odstín` };
}

export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ hex: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();

  const { hex: hexParam } = await params;
  const { error } = await searchParams;
  const fullHex = `#${hexParam.toLowerCase()}`;
  if (!/^#[0-9a-f]{6}$/.test(fullHex)) notFound();

  const color = await getColorByHex(fullHex);
  if (!color) notFound();
  if (color.currentSubscriptionId) {
    redirect(`/colors/${hexParam.toLowerCase()}`);
  }

  const meta = cgaMetaForHex(color.hex);
  const ink = inkFor(color.hex);

  const defaultAmount = 1000;
  const defaultInstalments = 10;

  return (
    <Win title="C:\KUPSI\PLATBA.EXE">
      <div className="stack-loose">
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/colors">../katalog</Link> /{" "}
          <Link href={`/colors/${hexParam.toLowerCase()}`}>{color.name}</Link> /{" "}
          <b style={{ color: "var(--c0)" }}>nastav cenu</b>
        </p>

        <h1 className="h1">
          Tvoje cena. <span className="em">Tvoje tempo.</span>
        </h1>
        <p className="lede">
          Není to fixní pricing. <b>Ty rozhodneš</b>, kolik ti to za to stojí —
          <br />a do kolika splátek to chceš rozložit.
        </p>

        <div className="grid-2">
          <div className="sw" style={{ cursor: "default" }}>
            <div
              className="sw-color"
              style={{
                background: color.hex,
                color: ink,
                aspectRatio: "1/1",
              }}
            >
              <span className="corner">
                {String(meta.i).padStart(2, "0")}
              </span>
              <span className="badge free">VOLNÝ</span>
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: 24,
                  lineHeight: 1,
                  color: ink,
                }}
              >
                <div style={{ fontSize: 42, textTransform: "capitalize" }}>
                  {color.name}
                </div>
                <div style={{ fontSize: 16, opacity: 0.85, marginTop: 6 }}>
                  {color.hex}
                </div>
              </div>
            </div>
          </div>

          <form
            action="/api/subscriptions/create"
            method="post"
            className="outset"
            style={{ padding: 0 }}
          >
            <input type="hidden" name="hex" value={color.hex} />

            <div
              style={{
                background: "var(--c0)",
                color: "var(--c10)",
                padding: "4px 12px",
                fontSize: 13,
              }}
            >
              ── NASTAVENÍ PŘEDPLATNÉHO ─────────────────
            </div>
            <div style={{ padding: "20px 22px" }}>
              {error && (
                <div
                  className="inset"
                  style={{
                    background: "var(--c0)",
                    color: "var(--c12)",
                    marginBottom: 16,
                  }}
                >
                  <pre style={{ margin: 0, fontSize: 13 }}>
                    {`> Error — ${
                      error === "invalid_amount"
                        ? "Měsíční částka musí být kladné celé číslo."
                        : error === "invalid_instalments"
                          ? "Počet splátek musí být 1 až 31."
                          : error === "color_taken"
                            ? "Tento odstín už si někdo vzal."
                            : error === "already_subscribed"
                              ? "Tento odstín už ti patří."
                              : error === "gopay"
                                ? "Platební bránu se nepodařilo oslovit. Zkus to znovu."
                                : error}`}
                  </pre>
                </div>
              )}

              <h3 className="h3" style={{ marginBottom: 14 }}>
                1) Kolik měsíčně?
              </h3>
              <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
                Celková měsíční částka. Strhne se průběžně během měsíce,
                rozdělená do splátek níže.
                <br />
                Minimum 1 Kč, maximum 100 000 Kč.
              </p>
              <div className="row" style={{ alignItems: "center" }}>
                <input
                  className="input"
                  type="number"
                  name="monthlyAmountCzk"
                  min={1}
                  max={100000}
                  step={10}
                  defaultValue={defaultAmount}
                  required
                  style={{ maxWidth: 160 }}
                />
                <span style={{ color: "var(--c0)" }}>Kč / měsíc</span>
              </div>

              <hr className="dash" />

              <h3 className="h3" style={{ marginBottom: 14 }}>
                2) Na kolik splátek to rozdělit?
              </h3>
              <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
                Doporučujeme 5–10 — tolik plateb obvykle stačí, aby ti banka
                uznala karetní aktivitu.
              </p>
              <div className="row" style={{ alignItems: "center" }}>
                <input
                  className="input"
                  type="number"
                  name="instalmentsPerMonth"
                  min={1}
                  max={31}
                  step={1}
                  defaultValue={defaultInstalments}
                  required
                  style={{ maxWidth: 90 }}
                />
                <span style={{ color: "var(--c0)" }}>splátek za měsíc</span>
              </div>

              <hr className="dash" />

              <h3 className="h3" style={{ marginBottom: 6 }}>
                3) Souhrn
              </h3>
              <table className="spec" style={{ background: "var(--c15)" }}>
                <tbody>
                  <tr>
                    <td>Barva</td>
                    <td>
                      <b style={{ textTransform: "capitalize" }}>
                        {color.name}
                      </b>{" "}
                      ({color.hex})
                    </td>
                  </tr>
                  <tr>
                    <td>Měsíční částka</td>
                    <td>
                      <b>{formatCzk(defaultAmount)}</b> (vyber výše)
                    </td>
                  </tr>
                  <tr>
                    <td>Rozprostřeno do</td>
                    <td>{defaultInstalments} splátek (vyber výše)</td>
                  </tr>
                  <tr>
                    <td>První splátka</td>
                    <td>dnes přes GoPay (3-D Secure)</td>
                  </tr>
                  <tr>
                    <td>Další splátky</td>
                    <td>automaticky na pozadí, bez 3-D Secure</td>
                  </tr>
                </tbody>
              </table>

              <div
                className="row"
                style={{ justifyContent: "space-between", marginTop: 18 }}
              >
                <Link
                  className="btn"
                  href={`/colors/${hexParam.toLowerCase()}`}
                >
                  ← Zpět
                </Link>
                <button className="btn btn-primary" type="submit">
                  ► Pokračovat na GoPay
                </button>
              </div>
            </div>
          </form>
        </div>

        <p className="muted center" style={{ fontSize: 14 }}>
          Klikem souhlasíš s <Link href="/terms">pravidly</Link>.
          <br />
          Zrušit můžeš kdykoliv mailem na{" "}
          <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>. Bez
          výpovědní doby. Bez stesku.
        </p>
      </div>
    </Win>
  );
}
