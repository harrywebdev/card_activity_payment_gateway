import { notFound } from "next/navigation";
import Link from "next/link";
import { Win } from "@/components/win";
import { getColorByHex, inkFor, cgaMetaForHex } from "@/lib/colors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hex: string }>;
}) {
  const { hex } = await params;
  const fullHex = `#${hex.toLowerCase()}`;
  const color = await getColorByHex(fullHex);
  return {
    title: color ? `${color.name} (${fullHex}) | Kup si Odstín` : "Kup si Odstín",
  };
}

export default async function ColorDetail({
  params,
}: {
  params: Promise<{ hex: string }>;
}) {
  const { hex: hexParam } = await params;
  const fullHex = `#${hexParam.toLowerCase()}`;
  if (!/^#[0-9a-f]{6}$/.test(fullHex)) notFound();

  const color = await getColorByHex(fullHex);
  if (!color) notFound();

  const meta = cgaMetaForHex(color.hex);
  const user = await getCurrentUser();
  const owner = color.currentSubscription?.user;

  // Is THIS user the owner?
  const isMine =
    user && owner ? user.username === owner.username : false;

  // First instalment date (if owned) — looked up from the subscription
  let ownerStartDate: Date | null = null;
  if (color.currentSubscriptionId) {
    const sub = await prisma.subscription.findUnique({
      where: { id: color.currentSubscriptionId },
      select: { startedAt: true },
    });
    ownerStartDate = sub?.startedAt ?? null;
  }

  const ink = inkFor(color.hex);

  return (
    <Win title="C:\KUPSI\ODSTIN.EXE">
      <div className="stack-loose">
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/colors">../katalog</Link> /{" "}
          <b style={{ color: "var(--c0)", textTransform: "capitalize" }}>
            {color.name}
          </b>
        </p>

        <div className="grid-2">
          <div className="sw" style={{ cursor: "default" }}>
            <div
              className="sw-color"
              style={{
                background: color.hex,
                color: ink,
                aspectRatio: "1/1",
                borderBottom: "2px solid var(--c0)",
              }}
            >
              <span className="corner">{String(meta.i).padStart(2, "0")}</span>
              <span className={"badge " + (color.currentSubscriptionId ? "taken" : "free")}>
                {color.currentSubscriptionId ? "OBSAZENO" : "VOLNÝ"}
              </span>
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: 24,
                  color: ink,
                  lineHeight: 1,
                }}
              >
                <div style={{ fontSize: 48, textTransform: "capitalize" }}>
                  {color.name}
                </div>
                <div style={{ fontSize: 18, opacity: 0.85, marginTop: 8 }}>
                  {color.hex}
                </div>
              </div>
            </div>
          </div>

          <div className="stack-loose">
            <h1 className="h1" style={{ marginBottom: 0 }}>
              #{String(meta.i).padStart(2, "0")}{" "}
              <span className="em2" style={{ textTransform: "capitalize" }}>
                {color.name}
              </span>
            </h1>
            <p className="lede" style={{ marginTop: -8 }}>
              {color.currentSubscriptionId ? (
                <>
                  Tahle barva už má{" "}
                  <b style={{ color: "var(--c4)" }}>svého člověka</b>.
                  <br />
                  Vrať se, až ho přestane bavit.
                </>
              ) : (
                <>
                  Tahle barva je <b style={{ color: "var(--c4)" }}>volná</b>.
                  <br />
                  Můžeš si ji vzít teď hned.
                </>
              )}
            </p>

            <div className="outset" style={{ padding: 0 }}>
              <div
                style={{
                  background: "var(--c0)",
                  color: "var(--c10)",
                  padding: "4px 12px",
                  fontSize: 13,
                }}
              >
                ── SPECIFIKACE ─────────────────────
              </div>
              <table className="spec">
                <tbody>
                  <tr>
                    <td>Hex</td>
                    <td>
                      <b>{color.hex}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>RGB</td>
                    <td>{meta.rgb.join(", ")}</td>
                  </tr>
                  <tr>
                    <td>CGA index</td>
                    <td>{meta.i} z 15</td>
                  </tr>
                  <tr>
                    <td>Český název</td>
                    <td style={{ textTransform: "capitalize" }}>{color.name}</td>
                  </tr>
                  <tr>
                    <td>Anglický název</td>
                    <td>{meta.en}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="outset" style={{ padding: 0 }}>
              <div
                style={{
                  background: "var(--c0)",
                  color: "var(--c10)",
                  padding: "4px 12px",
                  fontSize: 13,
                }}
              >
                ── VLASTNÍK ────────────────────────
              </div>
              <div style={{ padding: "12px 16px", background: "var(--c7)" }}>
                {owner ? (
                  <p style={{ margin: 0, fontSize: 15 }}>
                    Tuhle barvu má{" "}
                    {ownerStartDate && (
                      <>
                        od{" "}
                        <b>
                          {ownerStartDate.toLocaleDateString("cs-CZ", {
                            day: "numeric",
                            month: "numeric",
                            year: "numeric",
                          })}
                        </b>{" "}
                      </>
                    )}
                    uživatel{" "}
                    <span
                      style={{
                        background: "var(--c0)",
                        color: "var(--c14)",
                        padding: "0 8px",
                      }}
                    >
                      @{owner.username}
                    </span>
                    .
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 15 }}>
                    Tahle barva je{" "}
                    <b style={{ color: "var(--c4)" }}>volná k převzetí</b>.
                    <br />
                    Cenu i splátky si nastavíš v dalším kroku.
                  </p>
                )}
              </div>
            </div>

            <div className="row">
              {isMine ? (
                <Link className="btn btn-primary" href="/dashboard">
                  ► Spravovat ve Můj účet
                </Link>
              ) : color.currentSubscriptionId ? (
                <button className="btn" disabled>
                  Obsazeno
                </button>
              ) : user ? (
                <Link
                  className="btn btn-primary"
                  href={`/subscribe/${hexParam.toLowerCase()}`}
                >
                  ► <span className="hot">V</span>zít si tuhle barvu
                </Link>
              ) : (
                <Link className="btn btn-primary" href="/login">
                  Přihlas se a kup si ji
                </Link>
              )}
              <Link className="btn" href="/colors">
                ← Katalog
              </Link>
            </div>
          </div>
        </div>

        <hr className="dash" />

        <div className="grid-2">
          <div>
            <h3 className="h3">Co s ní budeš dělat?</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Nic. <b>To je celá pointa.</b>
              <br />
              Bude tvoje. Ostatní 15 majitelů to bude vědět.
              <br />
              Můžeš si dát URL{" "}
              <span className="kbd">
                kupsiodstin.cz/{color.name.toLowerCase()}
              </span>
              <br />
              do bia a vést si o tom debaty na Twitteru.
            </p>
          </div>
          <div>
            <h3 className="h3">A je v tom nějaký háček?</h3>
            <p style={{ fontSize: 15, color: "var(--c0)" }}>
              Ne. Cenu i délku splácení si dáš sám.
              <br />
              Když přestaneš platit, barva se uvolní.
              <br />
              Žádný papír, žádný právník, <b>žádný DRM</b>.
            </p>
          </div>
        </div>
      </div>
    </Win>
  );
}
