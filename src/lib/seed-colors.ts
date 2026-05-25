import "server-only";
import { prisma } from "@/lib/db";
import colors from "@/seed/colors.json" with { type: "json" };

type SeedColor = { hex: string; name: string };

export type SeedColorsResult = {
  inserted: number;
  renamed: number;
  unchanged: number;
  pruned: number;
  retainedOwned: number;
  total: number;
};

/**
 * Idempotently syncs the colour catalogue against src/seed/colors.json.
 *
 * Called from:
 *   - The CLI seed runner (src/seed/seed-colors.ts) for local dev.
 *   - POST /api/admin/seed-colors for one-shot production seeding,
 *     protected by CRON_SECRET. Safe to call repeatedly.
 *
 * Sync semantics: upsert (insert / rename) every entry in colors.json,
 * delete every other Color that has no current subscription. Colours
 * with an active subscription survive even if they aren't in the
 * current catalogue.
 */
export async function syncColorCatalogue(): Promise<SeedColorsResult> {
  const seed = colors as SeedColor[];
  const seedHexes = new Set(seed.map((c) => c.hex.toLowerCase()));

  let inserted = 0;
  let renamed = 0;
  let unchanged = 0;

  for (const { hex, name } of seed) {
    const existing = await prisma.color.findUnique({ where: { hex } });
    if (!existing) {
      await prisma.color.create({ data: { hex, name } });
      inserted++;
    } else if (existing.name !== name) {
      await prisma.color.update({ where: { hex }, data: { name } });
      renamed++;
    } else {
      unchanged++;
    }
  }

  const stale = await prisma.color.findMany({
    where: {
      hex: { notIn: [...seedHexes] },
      currentSubscriptionId: null,
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.color.deleteMany({
      where: { id: { in: stale.map((c) => c.id) } },
    });
  }

  const retainedOwned = await prisma.color.count({
    where: {
      hex: { notIn: [...seedHexes] },
      currentSubscriptionId: { not: null },
    },
  });

  return {
    inserted,
    renamed,
    unchanged,
    pruned: stale.length,
    retainedOwned,
    total: seed.length,
  };
}
