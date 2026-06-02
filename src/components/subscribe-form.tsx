"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCzk } from "@/lib/format";

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 100;

type Props = {
  colorHex: string;
  colorName: string;
  backHref: string;
  initialAmount?: number;
  serverError?: string;
};

export function SubscribeForm({
  colorHex,
  colorName,
  backHref,
  initialAmount = 100,
  serverError,
}: Props) {
  const [amount, setAmount] = useState<number>(initialAmount);

  const amountValid =
    Number.isFinite(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;

  const inlineError = !amountValid
    ? `Měsíční částka musí být mezi ${formatCzk(MIN_AMOUNT)} a ${formatCzk(MAX_AMOUNT)}.`
    : null;

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
          Jedna platba měsíčně přes GoPay. Předplatné běží do té doby, dokud
          ho nezrušíš.
          <br />
          Minimum {formatCzk(MIN_AMOUNT)}, maximum {formatCzk(MAX_AMOUNT)}.
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            className="input"
            type="number"
            name="monthlyAmountCzk"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step={1}
            value={Number.isNaN(amount) ? "" : amount}
            onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
            required
            style={{ maxWidth: 160 }}
          />
          <span style={{ color: "var(--c0)" }}>Kč / měsíc</span>
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
          2) Souhrn
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
              <td>Důvod platby</td>
              <td>předplatné vlastnictví odstínu</td>
            </tr>
            <tr>
              <td>Měsíční částka</td>
              <td>
                <b>{formatCzk(amountValid ? amount : 0)}</b> / měsíc
              </td>
            </tr>
            <tr>
              <td>Trvání</td>
              <td>do zrušení — bez výpovědní doby</td>
            </tr>
            <tr>
              <td>První platba</td>
              <td>dnes přes GoPay</td>
            </tr>
            <tr>
              <td>Další platby</td>
              <td>jednou měsíčně, automaticky z uložené karty</td>
            </tr>
            <tr>
              <td>Zrušení</td>
              <td>
                kdykoliv na{" "}
                <a href="mailto:ahoj@kupsiodstin.cz">ahoj@kupsiodstin.cz</a>
              </td>
            </tr>
          </tbody>
        </table>

        <label
          className="muted"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13,
            marginTop: 14,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" name="consent" required style={{ marginTop: 3 }} />
          <span>
            Souhlasím se založením opakované platby s výše uvedenými parametry a
            s uložením platebních údajů u GoPay (PCI DSS Level 1). Beru na
            vědomí{" "}
            <Link href="/terms" target="_blank">
              pravidla
            </Link>{" "}
            a{" "}
            <Link href="/recurring" target="_blank">
              podmínky opakovaných plateb
            </Link>
            .
          </span>
        </label>

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
            disabled={!amountValid}
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
