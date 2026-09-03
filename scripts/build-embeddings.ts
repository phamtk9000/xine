import "dotenv/config";
import { db } from "../lib/db";
import {
  buildIdf,
  counts,
  embed,
  embedText,
  encode,
  DIMS,
  MODEL,
} from "../lib/rec/embed";

/**
 * Build a vector for every film in the catalogue.
 *
 *   npm run films:embed              only films without one
 *   npm run films:embed -- --all     rebuild everything
 *
 * Two passes, and the second cannot be skipped. Rarity is a property of the
 * corpus, not of a film: "detective" means something because most films are
 * not about one, and there is no way to know that from a single row. So the
 * first pass counts, the second embeds against those counts.
 *
 * Re-runnable and cheap — the whole catalogue takes about a minute — which
 * matters because the recipe will change, and a vector nobody can rebuild is
 * a vector nobody can improve.
 */

const BATCH = 150;

/**
 * One write, retried through a busy database.
 *
 * The catalogue importer may well be running while this is — that is the
 * normal case, since new films are exactly what needs embedding — and SQLite
 * serialises writers. Losing a full pass to a lock that would have cleared in
 * fifty milliseconds is an absurd way to fail.
 */
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

const SELECT = {
  id: true,
  title: true,
  originalTitle: true,
  synopsis: true,
  genres: true,
  director: true,
  cast: true,
  country: true,
  year: true,
} as const;

async function main() {
  const all = process.argv.includes("--all");

  const films = await db.film.findMany({ select: SELECT });
  console.log(`Reading ${films.length} films…`);

  // Pass one: what every word costs.
  const documents = films.map((film) => counts(embedText(film)));
  const idf = buildIdf(documents, films.length);
  console.log(`Vocabulary: ${idf.size} words across ${DIMS} buckets.`);

  const existing = all
    ? new Set<string>()
    : new Set(
        (
          await db.filmEmbedding.findMany({
            where: { model: MODEL },
            select: { filmId: true },
          })
        ).map((row) => row.filmId),
      );

  const todo = films.filter((film) => !existing.has(film.id));
  if (todo.length === 0) {
    console.log("Every film already has a current vector.");
    return;
  }

  console.log(`Embedding ${todo.length}…`);
  let done = 0;

  for (let start = 0; start < todo.length; start += BATCH) {
    const slice = todo.slice(start, start + BATCH);

    // One transaction per batch rather than per film: ninety thousand
    // round trips is an afternoon, ninety thousand rows in batches is a
    // minute.
    await write(() =>
      db.$transaction(
        slice.map((film) => {
          const vector = encode(embed(embedText(film), idf));
          const data = { vector, model: MODEL, dims: DIMS };
          return db.filmEmbedding.upsert({
            where: { filmId: film.id },
            create: { filmId: film.id, ...data },
            update: data,
          });
        }),
      ),
    );

    done += slice.length;
    process.stdout.write(`  …${done}/${todo.length}\n`);
  }

  console.log(`Done. ${done} vectors written.`);
}

main();
