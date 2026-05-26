import Link from "next/link";
import { Win } from "@/components/win";

export const metadata = {
  title: "Soukromí | Kup si Odstín",
};

export default function PrivacyPage() {
  return (
    <Win title="C:\KUPSI\GDPR.TXT">
      <div className="stack-loose" style={{ maxWidth: 820 }}>
        <pre
          className="ascii"
          style={{
            color: "var(--c1)",
            fontSize: 14,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {`     ╔══════════════════════════════════════════════════╗
     ║  GDPR.TXT — Co o tobě víme a co s tím děláme    ║
     ╚══════════════════════════════════════════════════╝`}
        </pre>

        <h1 className="h1">
          Soukromí. <span className="em">Vážně.</span>
        </h1>
        <p className="lede">
          Tohle není stránka, kde se tváříme, že nic neukládáme.
          <br />
          Ukládáme. <b>Minimum.</b> Tady je seznam.
        </p>

        <h3 className="h3">Co o tobě máme</h3>
        <table className="spec" style={{ background: "var(--c15)" }}>
          <tbody>
            <tr>
              <td>E-mail</td>
              <td>kvůli přihlášení a posílání dokladů</td>
            </tr>
            <tr>
              <td>Přezdívku</td>
              <td>zobrazujeme u tvé barvy v katalogu</td>
            </tr>
            <tr>
              <td>ID tvých barev</td>
              <td>nutné pro evidenci vlastnictví</td>
            </tr>
            <tr>
              <td>Historii plateb</td>
              <td>kvůli účetnictví, držíme 10 let dle zákona</td>
            </tr>
            <tr>
              <td>Stav splátek</td>
              <td>kdy jsme co strhli a jestli to prošlo</td>
            </tr>
          </tbody>
        </table>

        <h3 className="h3">Co o tobě nemáme</h3>
        <ul style={{ fontSize: 15, color: "var(--c0)" }}>
          <li>
            Tvoje skutečné jméno a adresu (pokud nám je sám nepošleš v mailu)
          </li>
          <li>Údaje o kartě — drží je GoPay, my vidíme jen ID transakce</li>
          <li>Žádný marketingový profil, žádný tracking po jiných webech</li>
          <li>Nemáme cookies třetích stran. Žádné. Vůbec.</li>
        </ul>

        <h3 className="h3">Komu to dáváme</h3>
        <p style={{ fontSize: 15, color: "var(--c0)" }}>
          <b>GoPay s.r.o.</b> (platby) a <b>Mailgun</b> (rozesílání mailů).
          Účetnímu jednou ročně souhrn. Nikomu jinému.
        </p>

        <h3 className="h3">Tvoje práva</h3>
        <p style={{ fontSize: 15, color: "var(--c0)" }}>
          Napiš na <a href="mailto:gdpr@kupsiodstin.cz">gdpr@kupsiodstin.cz</a>{" "}
          — pošleme ti export svých dat nebo ti účet smažeme. Účetní doklady
          držíme 10 let dle zákona; jinak jdou pryč.
        </p>

        <hr className="dash" />
        <p className="muted center">
          Pro otázky o datech:{" "}
          <a href="mailto:gdpr@kupsiodstin.cz">gdpr@kupsiodstin.cz</a>
        </p>
        <p className="center">
          <Link className="btn" href="/">
            ← Zpět na hlavní
          </Link>
        </p>
      </div>
    </Win>
  );
}
