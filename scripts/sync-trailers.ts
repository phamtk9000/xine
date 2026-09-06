import "dotenv/config";
import { db } from "../lib/db";
import { fetchTrailerKey, tmdbConfigured } from "../lib/tmdb";

/**
 * Fetch trailer keys for the films most likely to be put in front of somebody.
 *
 *   npm run films:trailers                  the 400 most-seen without one
 *   npm run films:trailers -- --take 2000
 *   npm run films:trailers -- --all         retry the ones that came back empty
 *
 * One request per film and seventy thousand films, so this does not try to do
 * all of them. Trending, the finalists and the deck all draw from the
 * well-known end of the catalogue, and that end is a few thousand titles —
 * everything below it can fetch on demand the day somebody actually opens it.
 *
 * A film with no trailer is recorded as having been asked about, not left to
 * be asked about again on every run. Without that distinction the script
 * spends its whole budget re-checking the same obscure titles that will never
 * have one, and never reaches the films that do.
 */

const PAUSE_MS = 120;

async function write<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
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
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set — nothing to fetch.");
    process.exit(1);
  }

  const all = process.argv.includes("--all");
  const takeArg = process.argv.indexOf("--take");
  const take = takeArg === -1 ? 400 : Number(process.argv[takeArg + 1]);

  const films = await db.film.findMany({
    where: {
      tmdbId: { not: null },
      // "" is the marker for asked-and-there-was-none; null means never asked.
      ...(all ? {} : { trailerKey: null }),
    },
    orderBy: { tmdbVotes: "desc" },
    take,
    select: { id: true, tmdbId: true, kind: true, title: true },
  });

  if (films.length === 0) {
    console.log("Every candidate already has a trailer, or has been asked.");
    return;
  }

  console.log(`Asking TMDB about ${films.length} films…`);

  let found = 0;
  let none = 0;

  for (const [index, film] of films.entries()) {
    const key = await fetchTrailerKey(
      film.tmdbId!,
      film.kind === "series" ? "series" : "film",
    ).catch(() => null);

    await write(() =>
      db.film.update({
        where: { id: film.id },
        data: { trailerKey: key ?? "" },
      }),
    );

    if (key) found++;
    else none++;

    if ((index + 1) % 50 === 0) {
      process.stdout.write(`  …${index + 1}/${films.length} — ${found} found\n`);
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log(`\nDone. ${found} trailers, ${none} with none on TMDB.`);
}

main();
