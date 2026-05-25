import "server-only";
import { prisma } from "@/lib/db";
import { cgaMetaForHex } from "@/lib/format";

// Re-export the pure helpers so existing imports of `@/lib/colors`
// don't have to change.
export { CGA_META, cgaMetaForHex, inkFor, formatCzk } from "@/lib/format";

export type ColorCard = {
  id: string;
  hex: string;
  name: string;
  cgaIndex: number;
  en: string;
  rgb: [number, number, number];
  owner: { username: string } | null;
};

/**
 * Returns all 16 colours, enriched with CGA-index/RGB/English-name
 * metadata. With a catalogue this small, we don't paginate.
 */
export async function listAllColors(): Promise<ColorCard[]> {
  const rows = await prisma.color.findMany({
    include: {
      currentSubscription: {
        select: { user: { select: { username: true } } },
      },
    },
  });
  return rows
    .map((c) => {
      const meta = cgaMetaForHex(c.hex);
      return {
        id: c.id,
        hex: c.hex,
        name: c.name,
        cgaIndex: meta.i,
        en: meta.en,
        rgb: meta.rgb,
        owner: c.currentSubscription
          ? { username: c.currentSubscription.user.username }
          : null,
      };
    })
    .sort((a, b) => a.cgaIndex - b.cgaIndex);
}

export async function getColorByHex(hex: string) {
  const row = await prisma.color.findUnique({
    where: { hex: hex.toLowerCase() },
    include: {
      currentSubscription: {
        include: { user: { select: { username: true } } },
      },
    },
  });
  return row;
}
