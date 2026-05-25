/**
 * Idempotently syncs the colour catalogue against src/seed/colors.json.
 *
 * Current catalogue: the 16 colours from IBM CGA monitors (RGBI palette,
 * 1981, with the famous "fixed" brown). Names in Czech.
 *
 * Sync semantics:
 *   - Upsert (insert / rename) every entry from colors.json
 *   - Delete every other Color row that has no current subscription
 *     (keeps a subscription's colour intact even if we ever shrink the
 *     catalogue further; the user can cancel to release the colour and
 *     it'll then be cleaned on the next seed run)
 *
 * Run:
 *   npm run seed:colors
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import colors from "./colors.json" with { type: "json" };

type SeedColor = { hex: string; name: string };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}
const dbPath = process.env.DATABASE_URL.replace(/^file:/, "");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  const seed = colors as SeedColor[];
  const seedHexes = new Set(seed.map((c) => c.hex.toLowerCase()));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const { hex, name } of seed) {
    const existing = await prisma.color.findUnique({ where: { hex } });
    if (!existing) {
      await prisma.color.create({ data: { hex, name } });
      inserted++;
    } else if (existing.name !== name) {
      await prisma.color.update({ where: { hex }, data: { name } });
      updated++;
    } else {
      unchanged++;
    }
  }

  // Prune anything else that has no current subscription.
  const stale = await prisma.color.findMany({
    where: {
      hex: { notIn: [...seedHexes] },
      currentSubscriptionId: null,
    },
    select: { id: true, hex: true },
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

  console.log(
    `Colour catalogue synced — inserted: ${inserted}, renamed: ${updated}, ` +
      `unchanged: ${unchanged}, pruned (unowned, off-catalogue): ${stale.length}` +
      (retainedOwned > 0
        ? `, retained because owned (off-catalogue): ${retainedOwned}`
        : ""),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
