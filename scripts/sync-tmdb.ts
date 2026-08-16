import "dotenv/config";
import { db } from "../lib/db";
import { fetchFilmDetail, searchMovie, tmdbConfigured } from "../lib/tmdb";

/**
 * Attaches TMDB ids and artwork to films already in the catalogue.
 *
 *   npm run films:sync            enrich every film missing a tmdbId
 *   npm run films:sync -- --all   re-enrich everything, overwriting artwork
 *
 * Editorial fields (synopsis, criticScore) are never overwritten — TMDB
 * overviews are marketing copy and the whole point of xine is that ours isn't.
 */
async function main() {
  if (!tmdbConfigured()) {
    console.error(
      "TMDB_API_KEY is not set in .env — nothing to sync.\n" +
        "The app works without it; films just render as type plates.",
    );
    process.exit(1);
  }

  const all = process.argv.includes("--all");
  const films = await db.film.findMany({
    where: all ? {} : { tmdbId: null },
    orderBy: { title: "asc" },
  });

  if (films.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  console.log(`Syncing ${films.length} films…`);
  let matched = 0;

  for (const film of films) {
    try {
      const id = film.tmdbId ?? (await searchMovie(film.title, film.year))?.id;
      if (!id) {
        console.warn(`  no match: ${film.title} (${film.year})`);
        continue;
      }

      const detail = await fetchFilmDetail(id);
      await db.film.update({
        where: { id: film.id },
        data: {
          tmdbId: detail.tmdbId,
          posterUrl: detail.posterUrl,
          backdropUrl: detail.backdropUrl,
          runtime: film.runtime ?? detail.runtime,
          cinematographer: film.cinematographer ?? detail.cinematographer,
          composer: film.composer ?? detail.composer,
          releasedAt: film.releasedAt ?? detail.releasedAt,
        },
      });
      matched++;
      console.log(`  ✓ ${film.title}`);
    } catch (error) {
      console.warn(`  ! ${film.title}: ${(error as Error).message}`);
    }

    // TMDB tolerates bursts, but there is no reason to be rude about it.
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  console.log(`\nMatched ${matched} of ${films.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
