/**
 * Idempotently upserts the colour catalogue from src/seed/colors.json.
 *
 * Source: https://xkcd.com/color/rgb.txt — public domain (CC0).
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
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const { hex, name } of colors as SeedColor[]) {
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

  console.log(
    `Colour catalogue seeded — inserted: ${inserted}, updated: ${updated}, unchanged: ${unchanged}, total: ${colors.length}`,
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
