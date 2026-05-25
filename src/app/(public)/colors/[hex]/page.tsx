import { notFound } from "next/navigation";
import Link from "next/link";
import { getColorByHex, isLightHex } from "@/lib/colors";
import { getCurrentUser } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hex: string }>;
}) {
  const { hex } = await params;
  const fullHex = `#${hex.toLowerCase()}`;
  const color = await getColorByHex(fullHex);
  return {
    title: color ? `${color.name} (${fullHex}) | ${BRAND_NAME}` : `${BRAND_NAME}`,
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

  const user = await getCurrentUser();
  const owner = color.currentSubscription?.user;
  const isOwnedByMe = user && owner && owner.username === user.username;
  const textClass = isLightHex(color.hex) ? "text-black" : "text-white";

  const rgb = hexToRgb(color.hex);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div
          className={`aspect-square rounded-xl border border-border flex items-end p-6 ${textClass}`}
          style={{ backgroundColor: color.hex }}
        >
          <div className="space-y-1">
            <div className="font-mono text-sm opacity-80">{color.hex}</div>
            <h1 className="text-3xl font-semibold capitalize">{color.name}</h1>
          </div>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Specifikace
            </h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Hex</dt>
              <dd className="font-mono">{color.hex}</dd>
              <dt className="text-muted-foreground">RGB</dt>
              <dd className="font-mono">
                {rgb.r}, {rgb.g}, {rgb.b}
              </dd>
              <dt className="text-muted-foreground">Název</dt>
              <dd className="capitalize">{color.name}</dd>
            </dl>
          </section>

          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Vlastník
            </h2>
            {owner ? (
              <div className="mt-2 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 font-mono text-sm">
                  {owner.username}
                  {isOwnedByMe && (
                    <span className="text-xs text-muted-foreground">(ty)</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Tento odstín má v tuto chvíli majitele. Bude opět dostupný,
                  až ho aktuální majitel uvolní.
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <p className="text-sm">Tento odstín je volný k převzetí.</p>
                {user ? (
                  <Link
                    href={`/subscribe/${hexParam.toLowerCase()}`}
                    className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
                  >
                    Koupit si tento odstín
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition"
                  >
                    Přihlas se pro nákup
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function hexToRgb(hex: string) {
  const clean = hex.replace(/^#/, "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
