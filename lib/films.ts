import "server-only";
import { db } from "@/lib/db";
import { AXES, averageAxis, averageOverall, round1 } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";

export type FilmSort = "trending" | "new" | "rated" | "az";

export type FilmSummary = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  runtime: number | null;
  country: string | null;
  genres: string[];
  posterUrl: string | null;
  criticScore: number | null;
  communityScore: number | null;
  ratingCount: number;
};

/**
 * Community aggregates for a set of films, in one query rather than N.
 * Returns a map so callers can zip it onto whatever film list they already
 * have without another round trip.
 */
async function communityScores(filmIds: string[]) {
  if (filmIds.length === 0) return new Map<string, { score: number; count: number }>();

  const grouped = await db.rating.groupBy({
    by: ["filmId"],
    where: { filmId: { in: filmIds } },
    _avg: { overall: true },
    _count: { _all: true },
  });

  return new Map(
    grouped.map((row) => [
      row.filmId,
      {
        score: row._avg.overall === null ? 0 : round1(row._avg.overall),
        count: row._count._all,
      },
    ]),
  );
}

export async function listFilms({
  sort = "trending",
  genre,
  country,
  decade,
  search,
  take = 60,
}: {
  sort?: FilmSort;
  genre?: string;
  country?: string;
  decade?: number;
  search?: string;
  take?: number;
} = {}): Promise<FilmSummary[]> {
  const films = await db.film.findMany({
    where: {
      ...(genre ? { genres: { contains: genre } } : {}),
      ...(country ? { country } : {}),
      ...(decade ? { year: { gte: decade, lt: decade + 10 } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { originalTitle: { contains: search } },
              { director: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy:
      sort === "new"
        ? [{ year: "desc" }, { title: "asc" }]
        : sort === "az"
          ? [{ title: "asc" }]
          : [{ criticScore: "desc" }, { title: "asc" }],
    take,
  });

  const scores = await communityScores(films.map((f) => f.id));

  const summaries: FilmSummary[] = films.map((film) => {
    const agg = scores.get(film.id);
    return {
      id: film.id,
      slug: film.slug,
      title: film.title,
      year: film.year,
      director: film.director,
      runtime: film.runtime,
      country: film.country,
      genres: fromCsv(film.genres),
      posterUrl: film.posterUrl,
      criticScore: film.criticScore,
      communityScore: agg?.score ?? null,
      ratingCount: agg?.count ?? 0,
    };
  });

  // "Trending" is rating volume first, quality second — what people are
  // actually watching this week, not the all-time top of the pile.
  if (sort === "trending") {
    summaries.sort(
      (a, b) =>
        b.ratingCount - a.ratingCount ||
        (b.communityScore ?? 0) - (a.communityScore ?? 0),
    );
  }
  if (sort === "rated") {
    summaries.sort(
      (a, b) => (b.communityScore ?? 0) - (a.communityScore ?? 0) || b.ratingCount - a.ratingCount,
    );
  }

  return summaries;
}

export async function getFilmBySlug(slug: string) {
  return db.film.findUnique({
    where: { slug },
    include: {
      ratings: true,
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
      listEntries: {
        include: { list: { select: { slug: true, title: true, editorial: true } } },
      },
    },
  });
}

export type FilmAggregate = {
  community: number | null;
  count: number;
  axes: Record<string, number | null>;
};

export function aggregateRatings(
  ratings: {
    overall: number;
    story: number | null;
    direction: number | null;
    visual: number | null;
    performance: number | null;
    sound: number | null;
  }[],
): FilmAggregate {
  const axes: Record<string, number | null> = {};
  for (const { key } of AXES) axes[key] = averageAxis(ratings, key);

  return {
    community: averageOverall(ratings),
    count: ratings.length,
    axes,
  };
}

/** Distinct facet values, for the filter rail on /films. */
export async function filmFacets() {
  const films = await db.film.findMany({
    select: { genres: true, country: true, year: true },
  });

  const genres = new Set<string>();
  const countries = new Set<string>();
  const decades = new Set<number>();

  for (const film of films) {
    for (const genre of fromCsv(film.genres)) genres.add(genre);
    if (film.country) countries.add(film.country);
    decades.add(Math.floor(film.year / 10) * 10);
  }

  return {
    genres: [...genres].sort(),
    countries: [...countries].sort(),
    decades: [...decades].sort((a, b) => b - a),
  };
}
