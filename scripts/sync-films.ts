import "dotenv/config";
import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * Copy imported films from the local catalogue to production.
 *
 *   npm run films:push -- --dry-run
 *   npm run films:push
 *
 * The alternative is running the nine-hour import a second time against
 * Turso, over the network, to arrive at rows that already exist on this
 * machine. This moves them instead: read locally, insert what production
 * does not have, leave everything else alone.
 *
 * Two rules, and they are the whole design.
 *
 * It only ever inserts. A film already in production — the editorial ones,
 * anything a reader imported on demand, anything from an earlier run of this
 * — is skipped rather than updated, because production is where the
 * synopses, the critic scores and the reviews live, and this machine's copy
 * of a film is not the authority on any of them.
 *
 * It matches on identity, not on rows. A film is the same film when its
 * TMDB id and kind match, and a slug is the same page whoever wrote it. Both
 * are checked before an insert is attempted, so a title that arrived in
 * production by a different route does not come back as a duplicate under a
 * suffixed slug.
 *
 * Resumable and re-runnable: what is already there is skipped, so a run that
 * dies halfway costs nothing but the reading.
 */

const BATCH = 100;

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback: number) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Where to push.
 *
 * Normally production, from the environment. `--target` overrides it with an
 * explicit URL, which exists so a push can be rehearsed against a copy of
 * the production database before it is aimed at the real one — the check
 * below refuses anything that is neither a libsql:// URL nor a deliberate
 * override, so the accident this is guarding against is a run that quietly
 * writes to dev.db and reports success.
 */
function target(): Client {
  const override = process.argv.indexOf("--target");
  if (override !== -1) {
    const url = process.argv[override + 1];
    console.log(`Pushing to an explicit target: ${url}\n`);
    return createClient({ url });
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken =
    process.env.TURSO_AUTH_TOKEN ??
    process.env.TURSO_DATABASE_AUTH_TOKEN ??
    process.env.DATABASE_AUTH_TOKEN;

  if (!url || !url.startsWith("libsql://")) {
    console.error(
      "TURSO_DATABASE_URL must be set to the production libsql:// URL.\n" +
        "  TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run films:push",
    );
    process.exit(1);
  }
  if (!authToken) {
    console.error("TURSO_AUTH_TOKEN is not set — refusing to connect.");
    process.exit(1);
  }

  return createClient({ url, authToken });
}

async function main() {
  const dryRun = flag("dry-run");
  const limit = option("limit", Infinity);

  const local = createClient({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  const remote = target();

  // The shape to copy, read from the source rather than hard-coded, so a
  // column added to the schema does not silently stop being synced.
  const columns = (await local.execute("PRAGMA table_info(Film)")).rows
    .map((row) => String(row.name))
    .filter((name) => name !== "id");

  const [localCount, remoteCount] = await Promise.all([
    local.execute("SELECT COUNT(*) AS n FROM Film"),
    remote.execute("SELECT COUNT(*) AS n FROM Film"),
  ]);
  console.log(`local:      ${localCount.rows[0].n} films`);
  console.log(`production: ${remoteCount.rows[0].n} films\n`);

  // What production already has, by both identities. A hundred thousand of
  // each is a few megabytes and one round trip, against a query per film.
  const held = await remote.execute("SELECT kind, tmdbId, slug FROM Film");
  const byTmdb = new Set<string>();
  const bySlug = new Set<string>();
  for (const row of held.rows) {
    if (row.tmdbId !== null) byTmdb.add(`${row.kind}:${row.tmdbId}`);
    bySlug.add(String(row.slug));
  }

  const source = await local.execute(
    `SELECT id, ${columns.map((c) => `"${c}"`).join(", ")} FROM Film ORDER BY tmdbVotes DESC`,
  );

  const placeholders = columns.map(() => "?").join(", ");
  const insert = `INSERT INTO Film (id, ${columns.map((c) => `"${c}"`).join(", ")}) VALUES (?, ${placeholders})`;

  let queued: { sql: string; args: InValue[] }[] = [];
  /** Rows chosen to go. Counted separately from `sent` so a dry run, which
      never flushes anything, still reports the size of the real job. */
  let planned = 0;
  let sent = 0;
  let skippedTmdb = 0;
  let skippedSlug = 0;

  const flush = async () => {
    if (queued.length === 0 || dryRun) {
      queued = [];
      return;
    }
    await remote.batch(queued, "write");
    sent += queued.length;
    queued = [];
    process.stdout.write(`  …${sent} pushed\n`);
  };

  for (const row of source.rows) {
    if (planned >= limit) break;

    const key = `${row.kind}:${row.tmdbId}`;
    if (row.tmdbId !== null && byTmdb.has(key)) {
      skippedTmdb++;
      continue;
    }
    if (bySlug.has(String(row.slug))) {
      skippedSlug++;
      continue;
    }

    // Claim both identities immediately, so a duplicate inside this run —
    // two local rows for one film — cannot be pushed twice.
    if (row.tmdbId !== null) byTmdb.add(key);
    bySlug.add(String(row.slug));

    planned++;
    queued.push({
      sql: insert,
      args: [row.id, ...columns.map((c) => (row[c] ?? null) as InValue)],
    });

    if (queued.length >= BATCH) await flush();
  }

  await flush();

  console.log(
    `\n${dryRun ? "[dry run] would push " : "pushed "}${dryRun ? planned : sent}, ` +
      `already in production ${skippedTmdb}, slug taken ${skippedSlug}.`,
  );

  if (!dryRun) {
    const after = await remote.execute("SELECT COUNT(*) AS n FROM Film");
    console.log(`production: ${remoteCount.rows[0].n} → ${after.rows[0].n} films.`);
  }
}

main();
