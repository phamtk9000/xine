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

  // The token's name depends on who created it. Set by hand it is
  // TURSO_AUTH_TOKEN; created by Turso's Vercel integration it inherits
  // whatever prefix was chosen there, so a project connected with the
  // prefix TURSO_DATABASE gets TURSO_DATABASE_AUTH_TOKEN instead. Both are
  // the same secret and there is nothing to be gained from being strict
  // about which spelling arrived.
  const authToken =
    process.env.TURSO_AUTH_TOKEN ??
    process.env.TURSO_DATABASE_AUTH_TOKEN ??
    process.env.DATABASE_AUTH_TOKEN;

  if (remote && !authToken) {
    throw new Error(
      "A remote database URL is set but no auth token is — expected " +
        "TURSO_AUTH_TOKEN, TURSO_DATABASE_AUTH_TOKEN or DATABASE_AUTH_TOKEN",
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

function client() {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const created = createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = created;
  return created;
}

/**
 * The client, created on first query rather than on import.
 *
 * This used to be `createClient()` at module scope, which coupled the build
 * to credentials the build does not use: `next build` imports every module
 * to collect page data, so a missing database URL took the whole deployment
 * down — on /_not-found, of all routes, which touches no data at all.
 *
 * A proxy keeps the call sites unchanged (`db.film.findMany(...)` still
 * reads as a client) while moving the connection to the first property
 * access. Functions are bound to the real client, so `db.$transaction` and
 * `db.$disconnect` keep their `this` when they are pulled off the proxy.
 *
 * The failure mode is better too: a missing URL now throws where a query is
 * made, in a request that can report it, rather than at import time in a
 * build step that has no idea what it was doing.
 */
export const db = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, property) {
    const real = client();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
