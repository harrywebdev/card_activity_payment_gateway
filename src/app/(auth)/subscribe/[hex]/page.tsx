import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getColorByHex, isLightHex } from "@/lib/colors";
import { BRAND_NAME } from "@/lib/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hex: string }>;
}) {
  const { hex } = await params;
  return { title: `Koupit odstín #${hex} | ${BRAND_NAME}` };
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

  // If the colour is already taken, bounce back to the detail page.
  if (color.currentSubscriptionId) {
    redirect(`/colors/${hexParam.toLowerCase()}`);
  }

  const textClass = isLightHex(color.hex) ? "text-black" : "text-white";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 items-start">
        <div
          className={`aspect-square rounded-xl border border-border flex items-end p-6 ${textClass}`}
          style={{ backgroundColor: color.hex }}
        >
          <div className="space-y-1">
            <div className="font-mono text-sm opacity-80">{color.hex}</div>
            <h1 className="text-2xl font-semibold capitalize">{color.name}</h1>
          </div>
        </div>

        <form
          action="/api/subscriptions/create"
          method="post"
          className="space-y-5"
        >
          <input type="hidden" name="hex" value={color.hex} />

          <header className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Nastav splátky</h2>
            <p className="text-sm text-muted-foreground">
              Vyber měsíční částku a počet splátek. Příští kroky tě převedou
              na zabezpečenou platební bránu GoPay, kde zadáš kartu a projdeš
              3-D Secure ověřením. Všechny další splátky proběhnou automaticky.
            </p>
          </header>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {error === "invalid_amount" && "Měsíční částka musí být kladné celé číslo."}
              {error === "invalid_instalments" && "Počet splátek musí být 1 až 31."}
              {error === "color_taken" && "Tento odstín už si někdo vzal."}
              {error === "already_subscribed" && "Tento odstín už ti patří."}
              {error === "gopay" && "Platební bránu se nepodařilo oslovit. Zkus to znovu."}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="monthlyAmountCzk" className="text-sm font-medium">
              Měsíční částka (CZK)
            </label>
            <input
              id="monthlyAmountCzk"
              name="monthlyAmountCzk"
              type="number"
              min={1}
              max={100000}
              defaultValue={100}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Tolik za odstín zaplatíš každý měsíc, rozdělené do splátek níže.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="instalmentsPerMonth" className="text-sm font-medium">
              Počet splátek za měsíc
            </label>
            <input
              id="instalmentsPerMonth"
              name="instalmentsPerMonth"
              type="number"
              min={1}
              max={31}
              defaultValue={10}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Splátky budou rozprostřené přirozeně napříč měsícem.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Pokračovat na GoPay →
          </button>
        </form>
      </div>
    </main>
  );
}
