import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 *
 * libSQL rather than better-sqlite3, so the same adapter serves a local file
 * in development and a hosted Turso database in production. That matters
 * because Vercel's filesystem is ephemeral and read-only: a file-backed
 * database there would accept writes into a copy that disappears when the
 * invocation ends, and report success while doing it. The daily cron in
 * app/api/cron/refresh only actually persists anything against a networked
 * database.
 *
 * Turso is libSQL, which is SQLite — so the schema provider stays `sqlite`
 * and nothing above this file changes. The three comma-separated columns
 * standing in for arrays (`genres`, `cast`, `filmReferences`) and the
 * case-insensitive `contains:` that the catalogue search relies on both keep
 * working exactly as they did, which is the reason for choosing it over
 * Postgres.
 */
function createClient() {
  // Turso when configured, the local file otherwise. Both go through the
  // same adapter, so dev and production differ only in the URL.
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set TURSO_DATABASE_URL (production) or DATABASE_URL (local) — see .env.example",
    );
  }

  // Only remote libsql:// and https:// URLs take a token; a local file:// URL
  // must not be handed one or the client rejects it.
  const remote = url.startsWith("libsql://") || url.startsWith("https://");
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (remote && !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing",
    );
  }

  return new PrismaClient({
    adapter: new PrismaLibSql({
      url,
      ...(remote ? { authToken } : {}),
    }),
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
