import Link from "next/link";
import { Win } from "@/components/win";

export const metadata = {
  title: "Pravidla | Kup si Odstín",
};

export default function TermsPage() {
  return (
    <Win title="C:\KUPSI\PRAVIDLA.TXT">
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
     ║  PRAVIDLA.TXT — Co si přesně kupuješ             ║
     ║  Aktualizováno: 25. 5. 2026                      ║
     ╚══════════════════════════════════════════════════╝`}
        </pre>

        <h1 className="h1">
          Pravidla. <span className="em">Krátká.</span>
        </h1>
        <p className="lede">
          Žádný 14stránkový PDF v právničtině.
          <br />
          Tohle ti přečteš za 90 sekund.
        </p>

        <div className="stack-loose">
          <section>
            <h3 className="h3">1. Co je „vlastnictví barvy"</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Je to <b>záznam v naší databázi</b>, který říká, že daný uživatel
              drží daný odstín. Není to autorské právo, není to ochranná známka,
              není to NFT. Je to evidence pro účely téhle hry.
            </p>
          </section>
          <section>
            <h3 className="h3">2. Cenu a splátky určuješ ty</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Minimální měsíční částka je <b>1&nbsp;Kč</b>, maximální
              100&nbsp;000&nbsp;Kč. Počet splátek za měsíc 1–31. Strhává se
              průběžně během měsíce přes GoPay.
            </p>
          </section>
          <section>
            <h3 className="h3">3. Co když přestaneš platit</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Když ti platba selže <b>třikrát po sobě</b>, barvu uvolníme zpátky
              do palety. Žádné penále, žádný inkasní agent. Jen už nebude tvoje.
            </p>
          </section>
          <section>
            <h3 className="h3">4. Můžeš barvu pustit kdykoliv</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Napiš mail na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a> a
              barvu uvolníme. Žádná výpovědní doba, žádné poslední 3 měsíce.{" "}
              <b>Pustíš — zmizí.</b>
            </p>
          </section>
          <section>
            <h3 className="h3">5. Vrácení peněz</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Do <b>14 dnů od prvního stržení</b> ti vrátíme celou částku, když
              si to rozmyslíš. Pošli mail na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>. Po
              14 dnech už si peníze necháváme. Logiku to dává.
            </p>
          </section>
          <section>
            <h3 className="h3">6. Můžeme tě vyhodit</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Když si jako přezdívku zvolíš něco hnusného, vulgárního nebo
              cíleně urážlivého, dáme ti šanci to opravit. Pak ti rušíme účet a
              barva se uvolní. <b>Nediskutujeme.</b>
            </p>
          </section>
          <section>
            <h3 className="h3">7. Tohle není investice</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Vážně. Žádný výnos, žádný sekundární trh, žádné DAO. Když si od
              nás kupuješ barvu, dělá to jenom <b>tobě dobře u srdce</b>.
            </p>
          </section>
        </div>

        <hr className="dash" />
        <p className="muted center">
          Provozuje <b>Kup si Odstín</b>. IČO doplníme, až bude. <br />
          Otázky: <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>
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
