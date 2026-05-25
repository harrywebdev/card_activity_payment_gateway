import Link from "next/link";
import { Win } from "@/components/win";

export const metadata = {
  title: "Přihlášení | Kup si Odstín",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <Win title="C:\KUPSI\LOGIN.COM">
      <div className="stack-loose" style={{ maxWidth: 680, margin: "10px auto 0" }}>
        <pre
          className="ascii"
          style={{
            color: "var(--c1)",
            fontSize: 14,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
{`     ┌─ LOGIN.COM ──────────────────────────────────────┐
     │  Žádná hesla. Žádné OAuth. Jen tvůj e-mail.      │
     └──────────────────────────────────────────────────┘`}
        </pre>

        <h1 className="h1">
          Přihlas se. <span className="em">Jednoduše.</span>
        </h1>
        <p className="lede">
          Necháme ti přijít{" "}
          <b style={{ color: "rgb(94, 255, 0)" }}>magický odkaz</b> na mail.
          <br />
          Klikneš — jsi uvnitř. Žádný captcha, žádný cookie monstr.
        </p>

        {sent && (
          <div
            className="outset"
            style={{ padding: 0, borderColor: "var(--c10)" }}
          >
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c10)",
                padding: "4px 12px",
                fontSize: 13,
              }}
            >
              ── ODESLÁNO ─────────────────────────────────
            </div>
            <div style={{ padding: "14px 18px", fontSize: 15 }}>
              Pokud je tvůj e-mail mezi povolenými, odkaz dorazil do schránky.
              Platnost 15 minut. Otevři si schránku a klikni na odkaz.
            </div>
          </div>
        )}

        {error && (
          <div className="outset" style={{ padding: 0 }}>
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c12)",
                padding: "4px 12px",
                fontSize: 13,
              }}
            >
              ── CHYBA ────────────────────────────────────
            </div>
            <div style={{ padding: "14px 18px", fontSize: 15, color: "var(--c0)" }}>
              {error === "invalid" && "Odkaz je neplatný nebo už použitý."}
              {error === "expired" && "Odkaz vypršel. Požádej o nový."}
              {error === "not_allowed" && "Tento e-mail nemá přístup."}
            </div>
          </div>
        )}

        <div className="outset" style={{ padding: 0 }}>
          <div
            style={{
              background: "var(--c0)",
              color: "var(--c10)",
              padding: "4px 12px",
              fontSize: 13,
            }}
          >
            ── PŘIHLÁŠENÍ ───────────────────────────────
          </div>
          <div style={{ padding: "18px 22px" }}>
            <form action="/api/auth/request-link" method="post">
              <div className="field-row">
                <label htmlFor="email">E-mail:</label>
                <input
                  id="email"
                  name="email"
                  className="input"
                  type="email"
                  required
                  autoFocus
                  placeholder="tvuj@email.cz"
                  autoComplete="email"
                />
              </div>
              <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
                Po prvním přihlášení ti přidělíme krátkou přezdívku.
                <br />
                Ta se ti pak ukáže u tvojí barvy v katalogu.
              </p>
              <hr className="dash" />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Link className="btn" href="/">
                  Zpět
                </Link>
                <button className="btn btn-primary" type="submit">
                  ► Poslat odkaz
                </button>
              </div>
            </form>
          </div>
        </div>

        <p
          className="muted"
          style={{ fontSize: 14, textAlign: "center" }}
        >
          Přihlášením souhlasíš s <Link href="/terms">pravidly</Link> a{" "}
          <Link href="/privacy">zpracováním údajů</Link>.
          <br />
          (Skoro nic neukládáme.)
        </p>
      </div>
    </Win>
  );
}
