import "dotenv/config";
import { db } from "../lib/db";
import { deriveProfile, PROFILE_SELECT } from "../lib/rec/derive";
import { clustersFor, CLUSTERS } from "../lib/rec/clusters";

/**
 * Work out which editorial clusters every film belongs to.
 *
 *   npm run films:cluster
 *
 * Membership is computed from the semantic profile, so this is a derivation
 * rather than a tagging exercise: run it again after the profile recipe
 * changes and every film's memberships move with it. Idempotent, and fast
 * enough that rebuilding the lot is the normal way to run it.
 */

const BATCH = 400;

async function write<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    }
  }
}

async function main() {
  const films = await db.film.findMany({
    select: { id: true, ...PROFILE_SELECT },
  });
  console.log(`Reading ${films.length} films…`);

  const rows: { filmId: string; cluster: string; weight: number }[] = [];
  for (const film of films) {
    for (const row of clustersFor(deriveProfile(film))) {
      rows.push({ filmId: film.id, cluster: row.cluster, weight: row.weight });
    }
  }

  console.log(`${rows.length} memberships across ${CLUSTERS.length} clusters.`);
  await write(() => db.filmCluster.deleteMany({}));

  for (let start = 0; start < rows.length; start += BATCH) {
    await write(() =>
      db.filmCluster.createMany({ data: rows.slice(start, start + BATCH) }),
    );
    process.stdout.write(`  …${Math.min(start + BATCH, rows.length)}/${rows.length}\n`);
  }

  const tally = await db.filmCluster.groupBy({
    by: ["cluster"],
    _count: { _all: true },
  });
  console.log("");
  for (const row of tally.sort((a, b) => b._count._all - a._count._all)) {
    const cluster = CLUSTERS.find((c) => c.key === row.cluster);
    console.log(`  ${String(row._count._all).padStart(6)}  ${cluster?.label ?? row.cluster}`);
  }
}

main();
