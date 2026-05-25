import { describe, it, expect } from "vitest";
import {
  esc,
  fmtCzk,
  fmtDate,
  fmtMonth,
  pl,
  tplActivation,
  tplInstalmentSuccess,
  tplInstalmentFailure,
  tplDailySummary,
  tplMonthlyRecap,
  tplPlannerError,
  tplExecutorError,
} from "@/lib/telegram-templates";

describe("esc", () => {
  it("escapes the HTML-significant characters", () => {
    expect(esc("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(esc("<script>")).toBe("&lt;script&gt;");
    expect(esc("a&b<c>d")).toBe("a&amp;b&lt;c&gt;d");
  });
  it("is a no-op for safe strings", () => {
    expect(esc("černá")).toBe("černá");
    expect(esc("karpa")).toBe("karpa");
  });
});

describe("fmtCzk", () => {
  it("formats integer amounts with the Czech thousands separator", () => {
    expect(fmtCzk(1)).toMatch(/^1\s*CZK$/);
    expect(fmtCzk(1234)).toMatch(/^1\s\s*234\s*CZK$/);
    expect(fmtCzk(1234567)).toMatch(/^1\s\s*234\s\s*567\s*CZK$/);
  });
});

describe("pl", () => {
  it("picks the right Czech plural form by count", () => {
    const forms = ["odstín", "odstíny", "odstínů"] as [string, string, string];
    expect(pl(1, forms)).toBe("odstín");
    expect(pl(2, forms)).toBe("odstíny");
    expect(pl(3, forms)).toBe("odstíny");
    expect(pl(4, forms)).toBe("odstíny");
    expect(pl(5, forms)).toBe("odstínů");
    expect(pl(10, forms)).toBe("odstínů");
    expect(pl(0, forms)).toBe("odstínů");
  });
});

describe("fmtDate / fmtMonth", () => {
  it("formats a date in Czech locale", () => {
    // 5 = June (0-indexed)
    const d = new Date(2026, 5, 1);
    expect(fmtDate(d)).toMatch(/1\.\s*6\.\s*2026/);
  });
  it("formats a month name in Czech", () => {
    const d = new Date(2026, 5, 1);
    expect(fmtMonth(d).toLowerCase()).toContain("červen");
  });
});

describe("tplActivation", () => {
  it("renders the activation message", () => {
    const msg = tplActivation({
      color: { name: "černá", hex: "#000000" },
      username: "karpa",
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      firstAmountCzk: 10,
    });
    expect(msg).toContain("Nové předplatné");
    expect(msg).toContain("<b>černá</b>");
    expect(msg).toContain("<code>#000000</code>");
    expect(msg).toContain("karpa");
    expect(msg).toContain("v 10 splátkách");
  });

  it("HTML-escapes a color name containing & or <", () => {
    const msg = tplActivation({
      color: { name: "rock & roll", hex: "#000000" },
      username: "karpa",
      monthlyAmountCzk: 100,
      instalmentsPerMonth: 10,
      firstAmountCzk: 10,
    });
    expect(msg).toContain("rock &amp; roll");
    expect(msg).not.toContain("rock & roll");
  });
});

describe("tplInstalmentSuccess", () => {
  it("renders one-liner with hex, username, amount, and instalment counter", () => {
    const msg = tplInstalmentSuccess({
      color: { name: "modrá", hex: "#0000aa" },
      username: "lumin",
      amountCzk: 10,
      instalmentNumber: 3,
      instalmentsPerMonth: 10,
    });
    expect(msg).toContain("<b>modrá</b>");
    expect(msg).toContain("<code>#0000aa</code>");
    expect(msg).toContain("lumin");
    expect(msg).toContain("splátka 3/10");
  });
});

describe("tplInstalmentFailure", () => {
  it("renders the failure alert with the error message escaped", () => {
    const msg = tplInstalmentFailure({
      color: { name: "modrá", hex: "#0000aa" },
      username: "lumin",
      amountCzk: 10,
      attempts: 3,
      error: "GoPay 500: <network> error",
    });
    expect(msg).toContain("🚨");
    expect(msg).toContain("po 3 pokusech");
    expect(msg).toContain("&lt;network&gt;");
  });
});

describe("tplDailySummary", () => {
  it("returns null when there are no subscriptions", () => {
    expect(
      tplDailySummary({ date: new Date(), subs: [], totalSuccess: 0, totalFailed: 0 }),
    ).toBeNull();
  });

  it("renders the digest with one line per subscription", () => {
    const msg = tplDailySummary({
      date: new Date(2026, 5, 25),
      subs: [
        {
          color: { name: "černá", hex: "#000000" },
          username: "karpa",
          todaySuccess: 1,
          todayFailed: 0,
          todayAmountCzk: 10,
          completedThisMonth: 5,
          targetThisMonth: 10,
        },
        {
          color: { name: "modrá", hex: "#0000aa" },
          username: "lumin",
          todaySuccess: 0,
          todayFailed: 1,
          todayAmountCzk: 0,
          completedThisMonth: 3,
          targetThisMonth: 10,
        },
      ],
      totalSuccess: 1,
      totalFailed: 1,
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain("Denní souhrn");
    expect(msg).toContain("✅");
    expect(msg).toContain("⚠️");
    expect(msg).toContain("5/10");
    expect(msg).toContain("3/10");
    expect(msg).toContain("1× selhalo");
  });
});

describe("tplMonthlyRecap", () => {
  it("returns null when there are no subscriptions", () => {
    expect(tplMonthlyRecap({ monthDate: new Date(), subs: [] })).toBeNull();
  });

  it("uses the right Czech plural in the header (1/2-4/5+)", () => {
    const make = (n: number) =>
      tplMonthlyRecap({
        monthDate: new Date(2026, 4, 1),
        subs: Array.from({ length: n }, (_, i) => ({
          color: { name: "černá", hex: "#000000" },
          username: `u${i}`,
          completed: 10,
          target: 10,
          amountCzk: 100,
        })),
      })!;
    expect(make(1)).toContain("1 odstín ·");
    expect(make(2)).toContain("2 odstíny ·");
    expect(make(5)).toContain("5 odstínů ·");
  });

  it("marks subscriptions that hit / missed the target", () => {
    const msg = tplMonthlyRecap({
      monthDate: new Date(2026, 4, 1), // květen
      subs: [
        {
          color: { name: "černá", hex: "#000000" },
          username: "karpa",
          completed: 10,
          target: 10,
          amountCzk: 100,
        },
        {
          color: { name: "modrá", hex: "#0000aa" },
          username: "lumin",
          completed: 7,
          target: 10,
          amountCzk: 70,
        },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain("Měsíční rekapitulace");
    expect(msg).toContain("✅");
    expect(msg).toContain("⚠️");
    expect(msg).toContain("nesplněn limit");
    expect(msg).toContain("10/10");
    expect(msg).toContain("7/10");
  });
});

describe("tplPlannerError / tplExecutorError", () => {
  it("renders the planner error alert", () => {
    const m = tplPlannerError("foo bar");
    expect(m).toContain("Plánovač splátek selhal");
    expect(m).toContain("foo bar");
  });
  it("escapes user-provided error text", () => {
    const m = tplExecutorError("<script>alert(1)</script>");
    expect(m).not.toContain("<script>");
    expect(m).toContain("&lt;script&gt;");
  });
});
