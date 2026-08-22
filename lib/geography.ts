import "server-only";
import { db } from "@/lib/db";
import { COUNTRIES, countryName } from "@/lib/atlas";
import { fromCsv } from "@/lib/serialize";
import { round1 } from "@/lib/scores";

/**
 * Which cinemas of the world somebody has actually watched.
 *
 * Counted per country, not per film: a co-production credits every country
 * on it, so the totals here deliberately sum to more than the number of films
 * watched. The alternative — picking one "main" country — would quietly erase
 * the smaller partner from the map every time, which is the opposite of what
 * a map like this is for.
 */

export type CountryStat = {
  code: string;
  name: string;
  films: number;
  mean: number | null;
  favourite: { slug: string; title: string; score: number } | null;
};

export async function countriesWatched(username: string): Promise<{
  countries: CountryStat[];
  total: number;
  filmsPlaced: number;
  filmsUnplaced: number;
}> {
  const ratings = await db.rating.findMany({
    where: { user: { username } },
    select: {
      overall: true,
      film: {
        select: { slug: true, title: true, productionCountries: true },
      },
    },
  });

  const buckets = new Map<
    string,
    { films: number; sum: number; best: { slug: string; title: string; score: number } | null }
  >();

  let placed = 0;
  for (const r of ratings) {
    const codes = fromCsv(r.film.productionCountries ?? "").filter(
      (c) => c in COUNTRIES,
    );
    if (codes.length === 0) continue;
    placed++;

    for (const code of codes) {
      const b = buckets.get(code) ?? { films: 0, sum: 0, best: null };
      b.films++;
      b.sum += r.overall;
      if (!b.best || r.overall > b.best.score) {
        b.best = { slug: r.film.slug, title: r.film.title, score: r.overall };
      }
      buckets.set(code, b);
    }
  }

  const countries = [...buckets.entries()]
    .map(([code, b]) => ({
      code,
      name: countryName(code),
      films: b.films,
      mean: b.films ? round1(b.sum / b.films) : null,
      favourite: b.best,
    }))
    .sort((a, b) => b.films - a.films || a.name.localeCompare(b.name));

  return {
    countries,
    total: countries.length,
    filmsPlaced: placed,
    // Films TMDB gave no production country for. Surfaced rather than hidden,
    // so the headline count is never quietly wrong.
    filmsUnplaced: ratings.length - placed,
  };
}
