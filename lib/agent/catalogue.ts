import "server-only";
import { db } from "@/lib/db";
import { AXES, averageAxis, averageOverall } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";
import { inChunks } from "@/lib/batch";

/**
 * The data layer the finder agent works against.
 *
 * These are ordinary queries — the agent calls them through tools, but nothing
 * here knows or cares about that, so the same functions back the deterministic
 * fallback when no model key is configured.
 */

export type CatalogueRow = {
  slug: string;
  title: string;
  year: number;
  director: string;
  country: string | null;
  runtime: number | null;
  genres: string[];
  criticScore: number | null;
  communityScore: number | null;
  reviewed: boolean;
  posterUrl: string | null;
  axes: Record<string, number | null>;
};

async function toRows(
  films: {
    slug: string;
    title: string;
    year: number;
    director: string;
    country: string | null;
    runtime: number | null;
    genres: string;
    reviewed: boolean;
    criticScore: number | null;
    posterUrl: string | null;
    id: string;
  }[],
): Promise<CatalogueRow[]> {
  if (films.length === 0) return [];

  const ratings = await inChunks(
    films.map((f) => f.id),
    (batch) => db.rating.findMany({ where: { filmId: { in: batch } } }),
  );

  const byFilm = new Map<string, typeof ratings>();
  for (const rating of ratings) {
    const list = byFilm.get(rating.filmId) ?? [];
    list.push(rating);
    byFilm.set(rating.filmId, list);
  }

  return films.map((film) => {
    const filmRatings = byFilm.get(film.id) ?? [];
    const axes: Record<string, number | null> = {};
    for (const { key } of AXES) axes[key] = averageAxis(filmRatings, key);

    return {
      slug: film.slug,
      title: film.title,
      year: film.year,
      director: film.director,
      country: film.country,
      runtime: film.runtime,
      genres: fromCsv(film.genres),
      criticScore: film.criticScore,
      communityScore: averageOverall(filmRatings),
      reviewed: film.reviewed,
      posterUrl: film.posterUrl,
      axes,
    };
  });
}

/** Structured filter. Every field is optional; omitting all returns everything. */
export async function browseCatalogue(filters: {
  genre?: string;
  country?: string;
  director?: string;
  decade?: number;
  yearFrom?: number;
  yearTo?: number;
  maxRuntime?: number;
  limit?: number;
}) {
  const films = await db.film.findMany({
    where: {
      ...(filters.genre ? { genres: { contains: filters.genre } } : {}),
      ...(filters.country ? { country: { contains: filters.country } } : {}),
      ...(filters.director ? { director: { contains: filters.director } } : {}),
      ...(filters.maxRuntime ? { runtime: { lte: filters.maxRuntime } } : {}),
      ...(filters.decade
        ? { year: { gte: filters.decade, lt: filters.decade + 10 } }
        : filters.yearFrom || filters.yearTo
          ? {
              year: {
                ...(filters.yearFrom ? { gte: filters.yearFrom } : {}),
                ...(filters.yearTo ? { lte: filters.yearTo } : {}),
              },
            }
          : {}),
    },
    orderBy: { criticScore: "desc" },
    take: Math.min(filters.limit ?? 20, 40),
  });

  return toRows(films);
}

/** Free-text match across the fields worth matching on. */
export async function searchCatalogue(query: string, limit = 12) {
  const films = await db.film.findMany({
    where: {
      OR: [
        { title: { contains: query } },
        { originalTitle: { contains: query } },
        { director: { contains: query } },
        { synopsis: { contains: query } },
        { cast: { contains: query } },
        { genres: { contains: query } },
        { cinematographer: { contains: query } },
      ],
    },
    orderBy: { criticScore: "desc" },
    take: Math.min(limit, 40),
  });

  return toRows(films);
}

/**
 * Films ranked by a single axis. This is the query the six-axis rating system
 * exists to make possible — "show me the ones people rate highest on Visual"
 * is not answerable on a five-star site.
 */
export async function rankByAxis(axis: string, limit = 10) {
  const valid = AXES.some((a) => a.key === axis);
  if (!valid) return [];

  const films = await db.film.findMany({ orderBy: { title: "asc" } });
  const rows = await toRows(films);

  return rows
    .filter((row) => typeof row.axes[axis] === "number")
    .sort((a, b) => (b.axes[axis] ?? 0) - (a.axes[axis] ?? 0))
    .slice(0, Math.min(limit, 40));
}

export async function filmDetail(slug: string) {
  const film = await db.film.findUnique({
    where: { slug },
    include: { ratings: true },
  });
  if (!film) return null;

  const axes: Record<string, number | null> = {};
  for (const { key } of AXES) axes[key] = averageAxis(film.ratings, key);

  return {
    slug: film.slug,
    title: film.title,
    originalTitle: film.originalTitle,
    year: film.year,
    runtime: film.runtime,
    director: film.director,
    country: film.country,
    language: film.language,
    genres: fromCsv(film.genres),
    cast: fromCsv(film.cast),
    cinematographer: film.cinematographer,
    composer: film.composer,
    synopsis: film.synopsis,
    criticScore: film.criticScore,
    communityScore: averageOverall(film.ratings),
    ratingCount: film.ratings.length,
    axes,
  };
}

/** The facet lists, handed to the model up front so it never guesses a value. */
export async function catalogueFacets() {
  const films = await db.film.findMany({
    select: { genres: true, country: true, year: true, director: true },
  });

  const genres = new Set<string>();
  const countries = new Set<string>();
  const directors = new Set<string>();
  const decades = new Set<number>();

  for (const film of films) {
    for (const genre of fromCsv(film.genres)) genres.add(genre);
    if (film.country) countries.add(film.country);
    directors.add(film.director);
    decades.add(Math.floor(film.year / 10) * 10);
  }

  return {
    total: films.length,
    genres: [...genres].sort(),
    countries: [...countries].sort(),
    directors: [...directors].sort(),
    decades: [...decades].sort((a, b) => a - b),
  };
}
