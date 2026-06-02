/**
 * Pure functions that turn domain data into Telegram-HTML message strings.
 * Safe to import from anywhere (no DB / secrets / I/O).
 *
 * All user/domain string interpolation goes through `esc()` so that names
 * with `&`, `<`, or `>` never break Telegram's HTML parse mode. Today the
 * CGA-16 catalogue is fixed and safe, but future custom labels or
 * user-supplied content would.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const czkFormatter = new Intl.NumberFormat("cs-CZ");

export function fmtCzk(amount: number): string {
  return `${czkFormatter.format(amount)} CZK`;
}

const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

export function fmtDate(d: Date): string {
  return dateFormatter.format(d);
}

const monthFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

export function fmtMonth(d: Date): string {
  return monthFormatter.format(d);
}

/**
 * Czech 3-form plural: `pl(n, ["odstín", "odstíny", "odstínů"])`
 *   - n=1            → "odstín"
 *   - n ∈ {2, 3, 4}  → "odstíny"
 *   - everything else → "odstínů"
 *   (Edge case 0 uses the same gen-pl form as 5+.)
 */
export function pl(n: number, forms: [string, string, string]): string {
  if (n === 1) return forms[0];
  if (n >= 2 && n <= 4) return forms[1];
  return forms[2];
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ColorRef = { name: string; hex: string };

export type SubProgress = {
  color: ColorRef;
  username: string;
  todaySuccess: number;
  todayFailed: number;
  todayAmountCzk: number;
  /** "succeeded" | "pending" | "in_progress" | "failed" | "missing" */
  thisMonthStatus: string;
};

export type MonthSubProgress = {
  color: ColorRef;
  username: string;
  /** "succeeded" | "pending" | "in_progress" | "failed" */
  status: string;
  amountCzk: number;
};

// ─── Templates ──────────────────────────────────────────────────────────────

export function tplActivation(args: {
  color: ColorRef;
  username: string;
  monthlyAmountCzk: number;
}): string {
  return [
    `🎨 <b>Nové předplatné</b>`,
    `<b>${esc(args.color.name)}</b> <code>${esc(args.color.hex)}</code> — ${esc(args.username)}`,
    `${fmtCzk(args.monthlyAmountCzk)} / měsíc`,
    `První platba proběhla.`,
  ].join("\n");
}

export function tplChargeSuccess(args: {
  color: ColorRef;
  username: string;
  amountCzk: number;
  /** e.g. "06/2026" */
  monthLabel: string;
}): string {
  return (
    `💳 <b>${esc(args.color.name)}</b> <code>${esc(args.color.hex)}</code> — ` +
    `${esc(args.username)}: ${fmtCzk(args.amountCzk)} · ${esc(args.monthLabel)}`
  );
}

export function tplChargeFailure(args: {
  color: ColorRef;
  username: string;
  amountCzk: number;
  attempts: number;
  error: string;
}): string {
  return [
    `🚨 <b>Platba selhala</b>`,
    `<b>${esc(args.color.name)}</b> <code>${esc(args.color.hex)}</code> — ${esc(args.username)}`,
    `${fmtCzk(args.amountCzk)} po ${args.attempts} pokusech`,
    `<i>${esc(args.error)}</i>`,
  ].join("\n");
}

function statusFlag(status: string): string {
  switch (status) {
    case "succeeded":
      return "✅";
    case "failed":
      return "🚨";
    case "missing":
      return "❓";
    default:
      return "⏳"; // pending / in_progress
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "succeeded":
      return "stržena";
    case "failed":
      return "selhala";
    case "missing":
      return "chybí";
    case "in_progress":
      return "běží";
    default:
      return "čeká";
  }
}

export function tplDailySummary(args: {
  date: Date;
  subs: SubProgress[];
  totalSuccess: number;
  totalFailed: number;
}): string | null {
  if (args.subs.length === 0) return null;

  const subLines = args.subs.map((s) => {
    const flag = s.todayFailed > 0 ? "⚠️" : s.todaySuccess > 0 ? "✅" : "·";
    const failPart = s.todayFailed > 0 ? `, ${s.todayFailed}× selhalo` : "";
    return (
      `${flag} <b>${esc(s.color.name)}</b> <code>${esc(s.color.hex)}</code> — ` +
      `${esc(s.username)}: dnes ${s.todaySuccess}× (${fmtCzk(s.todayAmountCzk)})` +
      failPart +
      ` · měsíc ${statusLabel(s.thisMonthStatus)}`
    );
  });

  const header =
    `📊 <b>Denní souhrn</b> — ${fmtDate(args.date)}\n` +
    `${args.totalSuccess}× úspěšných, ${args.totalFailed}× neúspěšných ` +
    `napříč ${args.subs.length} ${pl(args.subs.length, ["odstínem", "odstíny", "odstíny"])}`;

  return `${header}\n\n${subLines.join("\n")}`;
}

export function tplMonthlyRecap(args: {
  monthDate: Date;
  subs: MonthSubProgress[];
}): string | null {
  if (args.subs.length === 0) return null;

  const subLines = args.subs.map((s) => {
    const flag = statusFlag(s.status);
    const note =
      s.status === "succeeded"
        ? ""
        : s.status === "failed"
          ? " — platba selhala"
          : ` — ${statusLabel(s.status)}`;
    return (
      `${flag} <b>${esc(s.color.name)}</b> <code>${esc(s.color.hex)}</code> — ` +
      `${esc(s.username)}: ${fmtCzk(s.amountCzk)}${note}`
    );
  });

  const totalAmount = args.subs
    .filter((s) => s.status === "succeeded")
    .reduce((a, s) => a + s.amountCzk, 0);
  const successCount = args.subs.filter((s) => s.status === "succeeded").length;

  const header =
    `🗓 <b>Měsíční rekapitulace</b> — ${esc(fmtMonth(args.monthDate))}\n` +
    `${args.subs.length} ${pl(args.subs.length, ["odstín", "odstíny", "odstínů"])} · ` +
    `${successCount}× ${pl(successCount, ["úspěšná platba", "úspěšné platby", "úspěšných plateb"])} · ` +
    `${fmtCzk(totalAmount)} celkem`;

  return `${header}\n\n${subLines.join("\n")}`;
}

export function tplPlannerError(error: string): string {
  return [
    `⚠️ <b>Plánovač plateb selhal</b>`,
    `<i>${esc(error)}</i>`,
    `Příští platby se nemusí naplánovat. Zkontroluj logy.`,
  ].join("\n");
}

export function tplExecutorError(error: string): string {
  return [`⚠️ <b>Vykonavatel plateb selhal</b>`, `<i>${esc(error)}</i>`].join(
    "\n",
  );
}
