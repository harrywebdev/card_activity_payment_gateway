"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCzk } from "@/lib/format";

const MIN_AMOUNT_PER_INSTALMENT = 1; // GoPay's effective minimum per charge
const MIN_AMOUNT_TOTAL = 1;
const MAX_AMOUNT_TOTAL = 100_000;
const MIN_INSTALMENTS = 1;
const MAX_INSTALMENTS = 31;

/**
 * Even split of `total` into `parts` integers that sum exactly to `total`.
 * Earlier parts get the +1 when the division has a remainder.
 *
 * Mirrors src/lib/planner.ts#splitAmount so the user sees the same numbers
 * the executor will charge.
 */
function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

type Props = {
  colorHex: string;
  colorName: string;
  backHref: string;
  initialAmount?: number;
  initialInstalments?: number;
  serverError?: string;
};

export function SubscribeForm({
  colorHex,
  colorName,
  backHref,
  initialAmount = 100,
  initialInstalments = 10,
  serverError,
}: Props) {
  const [amount, setAmount] = useState<number>(initialAmount);
  const [instalments, setInstalments] = useState<number>(initialInstalments);

  const amountValid =
    Number.isFinite(amount) &&
    amount >= MIN_AMOUNT_TOTAL &&
    amount <= MAX_AMOUNT_TOTAL;
  const instalmentsValid =
    Number.isFinite(instalments) &&
    instalments >= MIN_INSTALMENTS &&
    instalments <= MAX_INSTALMENTS;
  const perInstalmentValid =
    amountValid && instalmentsValid && amount >= instalments;

  const formValid = amountValid && instalmentsValid && perInstalmentValid;

  const split = formValid ? splitAmount(amount, instalments) : [];
  const minPart = split.length > 0 ? Math.min(...split) : 0;
  const maxPart = split.length > 0 ? Math.max(...split) : 0;
  const perInstalmentLabel =
    split.length === 0
      ? "—"
      : minPart === maxPart
        ? `${split.length} × ${formatCzk(minPart)}`
        : `${split.length} × ${formatCzk(minPart)}–${formatCzk(maxPart)}`;

  let inlineError: string | null = null;
  if (amountValid && instalmentsValid && !perInstalmentValid) {
    inlineError = `Při ${instalments} splátkách by jedna splátka byla méně než ${formatCzk(MIN_AMOUNT_PER_INSTALMENT)}. Zvyš měsíční částku nebo sniž počet splátek.`;
  } else if (!amountValid) {
    inlineError = `Měsíční částka musí být mezi ${formatCzk(MIN_AMOUNT_TOTAL)} a ${formatCzk(MAX_AMOUNT_TOTAL)}.`;
  } else if (!instalmentsValid) {
    inlineError = `Počet splátek musí být mezi ${MIN_INSTALMENTS} a ${MAX_INSTALMENTS}.`;
  }

  return (
    <form
      action="/api/subscriptions/create"
      method="post"
      className="outset"
      style={{ padding: 0 }}
    >
      <input type="hidden" name="hex" value={colorHex} />

      <div
        style={{
          background: "var(--c0)",
          color: "var(--c10)",
          padding: "4px 12px",
          fontSize: 13,
        }}
      >
        ── NASTAVENÍ PŘEDPLATNÉHO ─────────────────
      </div>

      <div style={{ padding: "20px 22px" }}>
        {serverError && (
          <div
            className="inset"
            style={{
              background: "var(--c0)",
              color: "var(--c12)",
              marginBottom: 16,
            }}
          >
            <pre style={{ margin: 0, fontSize: 13 }}>
{`> ${serverErrorMessage(serverError)}`}
            </pre>
          </div>
        )}

        <h3 className="h3" style={{ marginBottom: 14 }}>
          1) Kolik měsíčně?
        </h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
          Celková měsíční částka. Rozdělí se do splátek níže a strhne se
          průběžně během měsíce.
          <br />
          Minimum {formatCzk(MIN_AMOUNT_TOTAL)}, maximum{" "}
          {formatCzk(MAX_AMOUNT_TOTAL)}.
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            className="input"
            type="number"
            name="monthlyAmountCzk"
            min={MIN_AMOUNT_TOTAL}
            max={MAX_AMOUNT_TOTAL}
            step={1}
            value={Number.isNaN(amount) ? "" : amount}
            onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
            required
            style={{ maxWidth: 160 }}
          />
          <span style={{ color: "var(--c0)" }}>Kč / měsíc</span>
        </div>

        <hr className="dash" />

        <h3 className="h3" style={{ marginBottom: 14 }}>
          2) Na kolik splátek to rozdělit?
        </h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
          Splátky se rozprostřou přirozeně napříč měsícem. Každá musí být
          alespoň {formatCzk(MIN_AMOUNT_PER_INSTALMENT)}.
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            className="input"
            type="number"
            name="instalmentsPerMonth"
            min={MIN_INSTALMENTS}
            max={MAX_INSTALMENTS}
            step={1}
            value={Number.isNaN(instalments) ? "" : instalments}
            onChange={(e) =>
              setInstalments(parseInt(e.target.value || "0", 10))
            }
            required
            style={{ maxWidth: 90 }}
          />
          <span style={{ color: "var(--c0)" }}>splátek za měsíc</span>
        </div>

        {inlineError && (
          <div
            className="inset"
            style={{
              background: "var(--c0)",
              color: "var(--c12)",
              marginTop: 14,
            }}
          >
            <pre style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>
{`> ${inlineError}`}
            </pre>
          </div>
        )}

        <hr className="dash" />

        <h3 className="h3" style={{ marginBottom: 6 }}>
          3) Souhrn
        </h3>
        <table className="spec" style={{ background: "var(--c15)" }}>
          <tbody>
            <tr>
              <td>Barva</td>
              <td>
                <b style={{ textTransform: "capitalize" }}>{colorName}</b> (
                {colorHex})
              </td>
            </tr>
            <tr>
              <td>Měsíční částka</td>
              <td>
                <b>{formatCzk(amountValid ? amount : 0)}</b>
              </td>
            </tr>
            <tr>
              <td>Rozdělení</td>
              <td>{perInstalmentLabel}</td>
            </tr>
            <tr>
              <td>První splátka</td>
              <td>dnes přes GoPay</td>
            </tr>
            <tr>
              <td>Další splátky</td>
              <td>automaticky během měsíce</td>
            </tr>
          </tbody>
        </table>

        <div
          className="row"
          style={{ justifyContent: "space-between", marginTop: 18 }}
        >
          <Link className="btn" href={backHref}>
            ← Zpět
          </Link>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!formValid}
          >
            ► Pokračovat na GoPay
          </button>
        </div>
      </div>
    </form>
  );
}

function serverErrorMessage(code: string): string {
  switch (code) {
    case "invalid_amount":
      return "Měsíční částka mimo povolený rozsah.";
    case "invalid_instalments":
      return "Počet splátek mimo povolený rozsah.";
    case "instalment_too_small":
      return "Při daném počtu splátek by jedna splátka byla menší než 1 Kč.";
    case "color_taken":
      return "Tento odstín už si někdo vzal.";
    case "already_subscribed":
      return "Tento odstín už ti patří.";
    case "gopay":
      return "Platební bránu se nepodařilo oslovit. Zkus to znovu.";
    default:
      return code;
  }
}
