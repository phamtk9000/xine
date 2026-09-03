import "dotenv/config";
import { createClient, type Client, type InValue } from "@libsql/client";

/**
 * Copy the derived tables to production: profiles, vectors, clusters,
 * neighbours.
 *
 *   npm run films:push:derived -- --dry-run
 *   npm run films:push:derived
 *
 * These four tables are built by offline scripts, and running those scripts
 * against Turso over the network would take hours to produce rows that
 * already exist on this machine. So they are copied, on the same terms as the
 * film rows themselves.
 *
 * The filter that matters: production holds a subset of the local catalogue,
 * and every one of these tables has a foreign key to Film. A neighbour row
 * pointing at a film production has never heard of is a failed insert at
 * best, so rows are kept only when every film they mention is there.
 *
 * Idempotent by INSERT OR REPLACE keyed on the natural unique — a film has
 * one profile, one vector, one membership per cluster, one row per
 * neighbour — so a second run corrects rather than duplicates.
 */

const BATCH = 200;

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function target(): Client {
  const override = process.argv.indexOf("--target");
  if (override !== -1) return createClient({ url: process.argv[override + 1] });

  const url = process.env.TURSO_DATABASE_URL;
  const authToken =
    process.env.TURSO_AUTH_TOKEN ??
    process.env.TURSO_DATABASE_AUTH_TOKEN ??
    process.env.DATABASE_AUTH_TOKEN;

  if (!url?.startsWith("libsql://")) {
    console.error("TURSO_DATABASE_URL must be the production libsql:// URL.");
    process.exit(1);
  }
  if (!authToken) {
    console.error("TURSO_AUTH_TOKEN is not set — refusing to connect.");
    process.exit(1);
  }
  return createClient({ url, authToken });
}

type Table = {
  name: string;
  columns: string[];
  /** Which columns must name a film production already has. */
  filmRefs: string[];
};

const TABLES: Table[] = [
  {
    name: "FilmProfile",
    columns: ["id", "filmId", "dims", "source", "confidence", "version", "updatedAt"],
    filmRefs: ["filmId"],
  },
  {
    name: "FilmEmbedding",
    columns: ["id", "filmId", "vector", "model", "dims", "updatedAt"],
    filmRefs: ["filmId"],
  },
  {
    name: "FilmCluster",
    columns: ["id", "filmId", "cluster", "weight"],
    filmRefs: ["filmId"],
  },
  {
    name: "FilmNeighbour",
    columns: ["id", "filmId", "neighbourId", "score", "parts"],
    filmRefs: ["filmId", "neighbourId"],
  },
];

async function main() {
  const dryRun = flag("dry-run");

  const local = createClient({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  const remote = target();

  const held = await remote.execute("SELECT id FROM Film");
  const films = new Set(held.rows.map((row) => String(row.id)));
  console.log(`production holds ${films.size.toLocaleString()} films\n`);

  for (const table of TABLES) {
    const rows = await local.execute(
      `SELECT ${table.columns.map((c) => `"${c}"`).join(", ")} FROM ${table.name}`,
    );

    const usable = rows.rows.filter((row) =>
      table.filmRefs.every((column) => films.has(String(row[column]))),
    );

    console.log(
      `${table.name}: ${rows.rows.length.toLocaleString()} local, ` +
        `${usable.length.toLocaleString()} reference films production has`,
    );

    if (dryRun || usable.length === 0) continue;

    const sql = `INSERT OR REPLACE INTO ${table.name} (${table.columns
      .map((c) => `"${c}"`)
      .join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`;

    let sent = 0;
    for (let start = 0; start < usable.length; start += BATCH) {
      const slice = usable.slice(start, start + BATCH);
      await remote.batch(
        slice.map((row) => ({
          sql,
          args: table.columns.map((column) => (row[column] ?? null) as InValue),
        })),
        "write",
      );
      sent += slice.length;
      if (sent % 2000 === 0 || sent === usable.length) {
        process.stdout.write(`  …${sent.toLocaleString()}/${usable.length.toLocaleString()}\n`);
      }
    }
  }

  if (!dryRun) {
    console.log("");
    for (const table of TABLES) {
      const count = await remote.execute(`SELECT COUNT(*) AS n FROM ${table.name}`);
      console.log(`  ${table.name}: ${Number(count.rows[0].n).toLocaleString()} rows in production`);
    }
  }
}

main();
