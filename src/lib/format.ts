/**
 * Pure helpers safe to import from server OR client components.
 * (Anything that touches Prisma or env stays in src/lib/colors.ts.)
 */

export const CGA_META: Record<
  string,
  { i: number; en: string; rgb: [number, number, number] }
> = {
  "#000000": { i: 0, en: "Black", rgb: [0, 0, 0] },
  "#0000aa": { i: 1, en: "Blue", rgb: [0, 0, 168] },
  "#00aa00": { i: 2, en: "Green", rgb: [0, 168, 0] },
  "#00aaaa": { i: 3, en: "Cyan", rgb: [0, 168, 168] },
  "#aa0000": { i: 4, en: "Red", rgb: [168, 0, 0] },
  "#aa00aa": { i: 5, en: "Magenta", rgb: [168, 0, 168] },
  "#aa5500": { i: 6, en: "Brown", rgb: [168, 87, 0] },
  "#aaaaaa": { i: 7, en: "Light Gray", rgb: [168, 168, 168] },
  "#555555": { i: 8, en: "Dark Gray", rgb: [84, 84, 84] },
  "#5555ff": { i: 9, en: "Bright Blue", rgb: [84, 84, 252] },
  "#55ff55": { i: 10, en: "Bright Green", rgb: [84, 252, 84] },
  "#55ffff": { i: 11, en: "Bright Cyan", rgb: [84, 252, 252] },
  "#ff5555": { i: 12, en: "Bright Red", rgb: [252, 84, 84] },
  "#ff55ff": { i: 13, en: "Bright Magenta", rgb: [252, 84, 252] },
  "#ffff55": { i: 14, en: "Yellow", rgb: [252, 252, 84] },
  "#ffffff": { i: 15, en: "White", rgb: [252, 252, 252] },
};

export function cgaMetaForHex(hex: string) {
  return (
    CGA_META[hex.toLowerCase()] ?? {
      i: -1,
      en: hex,
      rgb: [0, 0, 0] as [number, number, number],
    }
  );
}

/** Best ink (black or white) for a swatch using DOS-style high contrast. */
export function inkFor(hex: string): "#000000" | "#FCFCFC" {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq > 140 ? "#000000" : "#FCFCFC";
}

const czkFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

export function formatCzk(n: number): string {
  return czkFormatter.format(n);
}
