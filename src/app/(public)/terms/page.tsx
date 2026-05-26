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
          Tohle si přečteš za 90 sekund.
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
              průběžně během měsíce přes GoPay. Nejsme plátci DPH — uvedené
              částky jsou konečné. Jedná se o digitální službu, žádné fyzické
              doručení neprobíhá.
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
            <h3 className="h3">6. Tohle není investice</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Vážně. Žádný výnos, žádný sekundární trh, žádné DAO. Když si od
              nás kupuješ barvu, dělá to jenom <b>tobě dobře u srdce</b>.
            </p>
          </section>
          <section>
            <h3 className="h3">7. Opakované platby</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Založením předplatného souhlasíš s&nbsp;opakovaným strhováním
              částky z&nbsp;uložené karty. Údaje o&nbsp;kartě ukládá výhradně{" "}
              <b>GoPay s.r.o.</b> v&nbsp;souladu se standardem PCI DSS Level 1 —
              my k&nbsp;nim nemáme přístup. Částka i&nbsp;frekvence jsou fixní a
              odpovídají parametrům, které sis zvolil/a při založení. Předplatné
              trvá do zrušení. Dokumentaci o&nbsp;platbách uchováváme minimálně
              12 měsíců po ukončení. Zrušit můžeš kdykoliv na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>.
            </p>
          </section>
          <section>
            <h3 className="h3">8. Reklamace</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Něco nefunguje, jak má? Napiš na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a> nebo
              pošli dopis na adresu Vrázova 983/1, 150 00 Praha 5. Reklamaci
              vyřídíme do <b>30 dnů</b> od přijetí. Odpovíme stejným kanálem,
              kterým nám napíšeš.
            </p>
          </section>
        </div>

        <hr className="dash" />
        <p className="muted center">
          Provozuje Marek Burč · IČO: 75239990
          <br />
          Vrázova 983/1, Smíchov, 150 00 Praha 5
          <br />
          <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a> ·{" "}
          <a href="tel:+420732676850">+420 732 676 850</a>
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
