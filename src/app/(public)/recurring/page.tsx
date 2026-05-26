import Link from "next/link";
import { Win } from "@/components/win";

export const metadata = {
  title: "Opakované platby | Kup si Odstín",
};

export default function RecurringPage() {
  return (
    <Win title="C:\KUPSI\OPAKOVANE.TXT">
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
     ║  OPAKOVANE.TXT — Podmínky opakovaných plateb    ║
     ╚══════════════════════════════════════════════════╝`}
        </pre>

        <h1 className="h1">
          Opakované <span className="em">platby</span>
        </h1>
        <p className="lede">
          Všeobecné obchodní podmínky najdeš v{" "}
          <Link href="/terms">Pravidlech</Link>. Tady je vše o tom, jak
          funguje automatické strhávání.
        </p>

        <div className="stack-loose">
          <section>
            <h3 className="h3">Důvod opakované platby</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Předplatné vlastnictví jednoho ze 16 odstínů CGA palety. Dokud
              platíš, odstín je tvůj.
            </p>
          </section>

          <section>
            <h3 className="h3">Částka</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Měsíční částku si volíš sám/sama při založení (min. 1 Kč, max.
              100 000 Kč). Částka je <b>fixní</b> — neměníme ji bez tvého
              vědomí. Maximální výše jedné splátky odpovídá celkové měsíční
              částce dělené počtem splátek, zaokrouhleno nahoru na celé koruny.
            </p>
          </section>

          <section>
            <h3 className="h3">Frekvence</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Měsíční částka se rozdělí do 1–31 splátek (volíš při založení).
              Splátky se rovnoměrně rozprostřou napříč měsícem. Frekvence je{" "}
              <b>fixní</b>.
            </p>
          </section>

          <section>
            <h3 className="h3">Trvání</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Předplatné běží <b>do zrušení</b>. Žádná minimální doba, žádná
              výpovědní lhůta.
            </p>
          </section>

          <section>
            <h3 className="h3">Uložení platebních údajů</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Údaje o kartě ukládá výhradně <b>GoPay s.r.o.</b> v souladu se
              standardem <b>PCI DSS Level 1</b>. My k údajům o kartě nemáme
              přístup — vidíme jen ID transakce.
            </p>
          </section>

          <section>
            <h3 className="h3">Jak zrušit</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Pošli mail na{" "}
              <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>{" "}
              nebo zavolej na{" "}
              <a href="tel:+420732676850">+420 732 676 850</a>. Předplatné
              ukončíme okamžitě. Žádné penále.
            </p>
          </section>

          <section>
            <h3 className="h3">Evidence</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Dokumentaci o platbách uchováváme minimálně{" "}
              <b>12 měsíců po ukončení</b> předplatného.
            </p>
          </section>
        </div>

        <hr className="dash" />
        <p className="muted center">
          Kontakt:{" "}
          <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a> ·{" "}
          <a href="tel:+420732676850">+420 732 676 850</a>
          <br />
          Obchodní podmínky: <Link href="/terms">Pravidla</Link> · Ochrana
          údajů: <Link href="/privacy">Soukromí</Link>
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
