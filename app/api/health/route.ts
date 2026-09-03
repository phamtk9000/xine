import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * What this deployment can actually see.
 *
 * Written during a deployment that would not come up, where every diagnosis
 * was a guess: the pages returned 500, the cron route said an environment
 * variable was missing, and there was no way from outside to tell whether
 * the running build predated the variables, whether the alias pointed at an
 * older deployment, or whether the database simply refused the connection.
 *
 * So it reports the three facts that separate those cases — the commit it
 * was built from, which variables are present, and whether a query returns —
 * and nothing else.
 *
 * Values are never returned, only presence. A boolean per name says whether
 * configuration arrived without disclosing what arrived, which is the whole
 * point: this endpoint is public, because an endpoint that needs the
 * configuration to be correct before it will tell you the configuration is
 * wrong is no use on the day you need it.
 */

export const dynamic = "force-dynamic";

const EXPECTED = [
  "TURSO_DATABASE_URL",
  "TURSO_DATABASE_AUTH_TOKEN",
  "TURSO_AUTH_TOKEN",
  "DATABASE_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
  "TMDB_API_KEY",
  "TMDB_WATCH_REGION",
  "ANTHROPIC_API_KEY",
] as const;

/** Errors can carry a connection string; a token must never leave here. */
function safeMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .split("\n")[0]
    .replace(/eyJ[\w.-]+/g, "<token>")
    .replace(/authToken=[^\s&]+/gi, "authToken=<token>")
    .slice(0, 200);
}

export async function GET() {
  const env = Object.fromEntries(
    EXPECTED.map((name) => [name, Boolean(process.env[name])]),
  );

  // Which URL the client will actually use, by host only — the host is not a
  // secret and it is the fastest way to see whether a deployment is talking
  // to Turso or to a file that does not exist.
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  const target = url.startsWith("libsql://") || url.startsWith("https://")
    ? new URL(url.replace("libsql://", "https://")).host
    : url || "unset";

  let database: Record<string, unknown>;
  try {
    const [films, lists] = await Promise.all([
      db.film.count(),
      db.filmList.count(),
    ]);
    database = { ok: true, films, lists };
  } catch (error) {
    database = { ok: false, error: safeMessage(error) };
  }

  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? "vercel" : "local",
      target,
      env,
      database,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
