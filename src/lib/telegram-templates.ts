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
  completedThisMonth: number;
  targetThisMonth: number;
};

export type MonthSubProgress = {
  color: ColorRef;
  username: string;
  completed: number;
  target: number;
  amountCzk: number;
};

// ─── Templates ──────────────────────────────────────────────────────────────

export function tplActivation(args: {
  color: ColorRef;
  username: string;
  monthlyAmountCzk: number;
  instalmentsPerMonth: number;
  firstAmountCzk: number;
}): string {
  return [
    `🎨 <b>Nové předplatné</b>`,
    `<b>${esc(args.color.name)}</b> <code>${esc(args.color.hex)}</code> — ${esc(args.username)}`,
    `${fmtCzk(args.monthlyAmountCzk)} / měsíc v ${args.instalmentsPerMonth} splátkách`,
    `První splátka ${fmtCzk(args.firstAmountCzk)} proběhla.`,
  ].join("\n");
}

export function tplInstalmentSuccess(args: {
  color: ColorRef;
  username: string;
  amountCzk: number;
  instalmentNumber: number;
  instalmentsPerMonth: number;
}): string {
  return (
    `💳 <b>${esc(args.color.name)}</b> <code>${esc(args.color.hex)}</code> — ` +
    `${esc(args.username)}: ${fmtCzk(args.amountCzk)} · ` +
    `splátka ${args.instalmentNumber}/${args.instalmentsPerMonth}`
  );
}

export function tplInstalmentFailure(args: {
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
      ` · měsíc ${s.completedThisMonth}/${s.targetThisMonth}`
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
    const hit = s.completed >= s.target;
    const flag = hit ? "✅" : "⚠️";
    const note = hit ? "" : " — nesplněn limit";
    return (
      `${flag} <b>${esc(s.color.name)}</b> <code>${esc(s.color.hex)}</code> — ` +
      `${esc(s.username)}: ${s.completed}/${s.target} (${fmtCzk(s.amountCzk)})${note}`
    );
  });

  const totalTx = args.subs.reduce((a, s) => a + s.completed, 0);
  const totalAmount = args.subs.reduce((a, s) => a + s.amountCzk, 0);

  const header =
    `🗓 <b>Měsíční rekapitulace</b> — ${esc(fmtMonth(args.monthDate))}\n` +
    `${args.subs.length} ${pl(args.subs.length, ["odstín", "odstíny", "odstínů"])} · ` +
    `${totalTx}× ${pl(totalTx, ["platba", "platby", "plateb"])} · ` +
    `${fmtCzk(totalAmount)} celkem`;

  return `${header}\n\n${subLines.join("\n")}`;
}

export function tplPlannerError(error: string): string {
  return [
    `⚠️ <b>Plánovač splátek selhal</b>`,
    `<i>${esc(error)}</i>`,
    `Příští platby se nemusí naplánovat. Zkontroluj logy.`,
  ].join("\n");
}

export function tplExecutorError(error: string): string {
  return [
    `⚠️ <b>Vykonavatel splátek selhal</b>`,
    `<i>${esc(error)}</i>`,
  ].join("\n");
}
