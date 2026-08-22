import "server-only";
import { db } from "@/lib/db";
import { COUNTRIES, countryName } from "@/lib/atlas";
import { fromCsv } from "@/lib/serialize";
import { round1 } from "@/lib/scores";

/**
 * Which cinemas of the world somebody has actually watched.
 *
 * Counted by ORIGIN, one country per film, not by the production credits.
 *
 * The first version used `productionCountries` on the reasoning that crediting
 * only the main country erases the smaller partner. That was wrong, and it
 * showed: Inside the Yellow Cocoon Shell is financed from France, Singapore,
 * Spain and the Netherlands, so it appeared as the sole film — and therefore
 * the "favourite" — of four countries at once, and a Vietnamese film was
 * being counted as Dutch cinema. The totals over-counted for the same reason:
 * twelve films read as twelve countries.
 *
 * Production countries answer "who paid for this". Origin answers "whose
 * cinema is this", which is the question a map like this is actually asking.
 * The co-production list is still on the row and is surfaced as context in
 * the panel rather than as geography.
 */

export type CountryStat = {
  code: string;
  name: string;
  films: number;
  mean: number | null;
  /** How many of them were made with money from elsewhere. */
  coProductions: number;
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
        select: {
          slug: true,
          title: true,
          originCountry: true,
          productionCountries: true,
        },
      },
    },
  });

  const buckets = new Map<
    string,
    {
      films: number;
      sum: number;
      coProductions: number;
      best: { slug: string; title: string; score: number } | null;
    }
  >();

  let placed = 0;
  for (const r of ratings) {
    // The first origin code is the film's home. TMDB lists the primary first,
    // and a film has one home even when it has four financiers.
    const home = fromCsv(r.film.originCountry ?? "").find((c) => c in COUNTRIES);
    if (!home) continue;
    placed++;

    const partners = fromCsv(r.film.productionCountries ?? "").filter(
      (c) => c !== home,
    ).length;

    const b = buckets.get(home) ?? {
      films: 0,
      sum: 0,
      coProductions: 0,
      best: null,
    };
    b.films++;
    b.sum += r.overall;
    if (partners > 0) b.coProductions++;
    if (!b.best || r.overall > b.best.score) {
      b.best = { slug: r.film.slug, title: r.film.title, score: r.overall };
    }
    buckets.set(home, b);
  }

  const countries = [...buckets.entries()]
    .map(([code, b]) => ({
      code,
      name: countryName(code),
      films: b.films,
      mean: b.films ? round1(b.sum / b.films) : null,
      coProductions: b.coProductions,
      favourite: b.best,
    }))
    .sort((a, b) => b.films - a.films || a.name.localeCompare(b.name));

  return {
    countries,
    total: countries.length,
    filmsPlaced: placed,
    // Films TMDB gave no origin for. Surfaced rather than hidden, so the
    // headline count is never quietly wrong.
    filmsUnplaced: ratings.length - placed,
  };
}
