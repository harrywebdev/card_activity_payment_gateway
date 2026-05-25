import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Win } from "@/components/win";
import { SubscribeForm } from "@/components/subscribe-form";
import { requireUser } from "@/lib/auth";
import { getColorByHex } from "@/lib/colors";
import { inkFor, cgaMetaForHex } from "@/lib/format";

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
              <span className="corner">{String(meta.i).padStart(2, "0")}</span>
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

          <SubscribeForm
            colorHex={color.hex}
            colorName={color.name}
            backHref={`/colors/${hexParam.toLowerCase()}`}
            serverError={error}
          />
        </div>

        <p className="muted center" style={{ fontSize: 14 }}>
          Klikem souhlasíš s <Link href="/terms">pravidly</Link>.
          <br />
          Zrušit můžeš kdykoliv po přihlášení. Bez výpovědní doby.
        </p>
      </div>
    </Win>
  );
}
