import Link from "next/link";
import { Win } from "@/components/win";
import { listAllColors, inkFor } from "@/lib/colors";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const [user, colors] = await Promise.all([getCurrentUser(), listAllColors()]);
  const taken = colors.filter((c) => c.owner !== null).length;
  const free = colors.length - taken;

  return (
    <Win title="C:\KUPSI\INDEX.EXE">
      <div className="stack-loose">
        <div className="wordmark">
          KupSi<span style={{ color: "var(--c15)" }}>Odst</span>
          <span style={{ color: "var(--c4)" }}>ín</span>
          <span className="sub">// jedna z 16 barev. tvá, dokud platíš.</span>
        </div>

        <div className="grid-2">
          <div>
            <h1 className="h1">
              Kup si <span className="em">vlastní</span> barvu.
            </h1>
            <p className="lede">
              Je to <b>úplná blbost</b>. A přesto to chceš.
            </p>
            <p
              style={{
                fontSize: 15,
                color: "var(--c0)",
                marginTop: 0,
                marginBottom: 4,
              }}
            >
              Žádných 949 odstínů. Jenom těch <b>16</b>,
              <br />
              co měl tvůj táta na 386ce na CGA monitoru.
              <br />
              Vyber si jednu — a je tvoje, dokud platíš.
            </p>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn btn-primary" href="/colors">
                [<span className="hot">K</span>] Vyber si barvu
              </Link>
              <Link className="btn" href={user ? "/dashboard" : "/login"}>
                [<span className="hot">P</span>]{" "}
                {user ? "Můj účet" : "Přihlas se"}
              </Link>
            </div>
            <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
              ► {free} z 16 barev je teď{" "}
              <span style={{ color: "var(--c4)" }}>volných</span>. Než někomu
              padnou do oka.
            </p>
          </div>

          <div className="outset" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c10)",
                padding: "6px 12px",
                borderBottom: "1px solid var(--c8)",
                fontSize: 13,
                letterSpacing: ".04em",
              }}
            >
              C:\&gt; dir PALETA\*.COL
            </div>
            <div
              style={{
                background: "var(--c0)",
                padding: 0,
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 0,
              }}
            >
              {colors.map((c) => {
                const ink = inkFor(c.hex);
                return (
                  <Link
                    key={c.id}
                    href={`/colors/${c.hex.replace("#", "")}`}
                    title={`${c.name} — ${c.hex}${c.owner ? " (obsazeno)" : " (volná)"}`}
                    style={{
                      position: "relative",
                      display: "block",
                      aspectRatio: "1 / 1",
                      background: c.hex,
                      color: ink,
                      textDecoration: "none",
                      border: "1px solid var(--c0)",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 6,
                        fontSize: 11,
                        lineHeight: 1,
                        fontWeight: 600,
                        color: ink,
                        opacity: 0.8,
                        letterSpacing: ".05em",
                      }}
                    >
                      {String(c.cgaIndex).padStart(2, "0")}
                    </span>
                    {c.owner && (
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 6,
                          fontSize: 10,
                          lineHeight: 1,
                          fontWeight: 700,
                          background: "var(--c0)",
                          color: "var(--c12)",
                          padding: "2px 4px",
                          letterSpacing: ".05em",
                        }}
                      >
                        ✕
                      </span>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        bottom: 5,
                        left: 6,
                        right: 6,
                        fontSize: 11,
                        lineHeight: 1.1,
                        fontWeight: 600,
                        color: ink,
                        opacity: 0.9,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textTransform: "capitalize",
                      }}
                    >
                      {c.name}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div
              style={{
                background: "var(--c0)",
                color: "var(--c8)",
                padding: "6px 12px",
                borderTop: "1px solid var(--c8)",
                fontSize: 12,
                letterSpacing: ".04em",
              }}
            >
              16 souborů &nbsp;·&nbsp;{" "}
              <span style={{ color: "var(--c10)" }}>{free} volných</span>
              &nbsp;·&nbsp;{" "}
              <span style={{ color: "var(--c12)" }}>{taken} obsazených</span>
              &nbsp;·&nbsp; klikni pro detail
            </div>
          </div>
        </div>

        <hr className="solid" />

        <div className="grid-3">
          <div>
            <div className="tag">01</div>
            <h3 className="h3">Jeden majitel.</h3>
            <p style={{ fontSize: 15, color: "var(--c0)", margin: 0 }}>
              Každá z 16 barev má v daný okamžik{" "}
              <b style={{ color: "var(--c4)" }}>právě jednoho</b> vlastníka.
              Žádný společný majetek, žádné edice. Jeden účet — jedna barva.
            </p>
          </div>
          <div>
            <div className="tag">02</div>
            <h3 className="h3">Cena podle tebe.</h3>
            <p style={{ fontSize: 15, color: "var(--c0)", margin: 0 }}>
              Ty určíš <b style={{ color: "var(--c4)" }}>cenu</b>. Strhává se
              to <b style={{ color: "var(--c4)" }}>jednou měsíčně</b>. Nic víc,
              nic míň.
            </p>
          </div>
          <div>
            <div className="tag">03</div>
            <h3 className="h3">Konec kdykoliv.</h3>
            <p style={{ fontSize: 15, color: "var(--c0)", margin: 0 }}>
              Až tě to přestane bavit, zrušíš odběr. Barva se uvolní.
              <b style={{ color: "var(--c4)" }}> Bez závazku</b>, bez výpovědní
              doby, bez papírů.
            </p>
          </div>
        </div>

        <hr className="dash" />

        <div className="center stack">
          <h2 className="h2">
            Tak jakou si <span className="em">vezmeš</span>?
          </h2>
          <p className="lede center">
            {free} barev čeká. <b>Ostatní už mají svého člověka.</b>
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" href="/colors">
              ► Otevřít katalog
            </Link>
            <Link className="btn" href="/terms">
              Přečíst pravidla
            </Link>
          </div>
        </div>
      </div>
    </Win>
  );
}
