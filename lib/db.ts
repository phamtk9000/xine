import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 connects through a driver adapter rather than a URL in the schema.
// Swapping to Postgres later means changing this file and the datasource
// provider, and nothing else: `npm i @prisma/adapter-pg` and hand the client a
// PrismaPg instead.
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env");

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Next reloads modules on every edit in dev; without the global cache each
// reload opens another connection and SQLite eventually refuses.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
