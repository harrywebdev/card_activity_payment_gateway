import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}
const dbPath = process.env.DATABASE_URL.replace(/^file:/, "");

const adapter = new PrismaBetterSqlite3({ url: dbPath });

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient>;
};

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NEXT_PUBLIC_APP_ENV === "development")
  globalForPrisma.prisma = prisma;
