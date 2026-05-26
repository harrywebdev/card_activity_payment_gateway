import Link from "next/link";
import { Win } from "@/components/win";

export const metadata = {
  title: "Kontakt | Kup si Odstín",
};

export default function ContactPage() {
  return (
    <Win title="C:\KUPSI\KONTAKT.TXT">
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
     ║  KONTAKT.TXT — Jak se nám ozvat                 ║
     ╚══════════════════════════════════════════════════╝`}
        </pre>

        <h1 className="h1">Kontakt</h1>

        <table className="spec" style={{ background: "var(--c15)" }}>
          <tbody>
            <tr>
              <td>Provozovatel</td>
              <td>
                <b>Marek Burč</b>
              </td>
            </tr>
            <tr>
              <td>IČO</td>
              <td>75239990</td>
            </tr>
            <tr>
              <td>Adresa</td>
              <td>Vrázova 983/1, Smíchov, 150 00 Praha 5</td>
            </tr>
            <tr>
              <td>E-mail</td>
              <td>
                <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>
              </td>
            </tr>
            <tr>
              <td>Telefon</td>
              <td>
                <a href="tel:+420732676850">+420 732 676 850</a>
              </td>
            </tr>
            <tr>
              <td>GDPR</td>
              <td>
                <a href="mailto:gdpr@kupsiodstin.cz">gdpr@kupsiodstin.cz</a>
              </td>
            </tr>
          </tbody>
        </table>

        <hr className="dash" />
        <p style={{ fontSize: 15, color: "var(--c0)" }}>
          Nejsme plátci DPH. Platby zpracovává{" "}
          <b>GoPay s.r.o.</b> Přijímáme Visa, Mastercard, 3D Secure.
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
