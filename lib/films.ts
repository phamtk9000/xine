import "server-only";
import { db } from "@/lib/db";
import { listArticles } from "@/lib/journal";
import { AXES, averageAxis, averageOverall, round1 } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";
import { inChunks } from "@/lib/batch";

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
  reviewed: boolean;
  tmdbScore: number | null;
  /** Count of Journal articles referencing this film — decides XINE Select
   *  alongside the score; see lib/seal.ts. */
  reviewCount: number;
};

/**
 * How many Journal pieces reference each film slug, in one filesystem read
 * rather than one per film. Editorial is markdown on disk, not a DB table
 * (see lib/journal.ts), so this is the equivalent of `communityScores`
 * below for that other source of truth.
 */
export async function editorialCounts() {
  const articles = await listArticles();
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const slug of article.films) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Community aggregates for a set of films, in one query rather than N.
 * Returns a map so callers can zip it onto whatever film list they already
 * have without another round trip.
 */
async function communityScores(filmIds: string[]) {
  if (filmIds.length === 0)
    return new Map<string, { score: number; count: number }>();

  // Batched: the ranked sorts ask for every filtered film at once, which
  // blows SQLite's bound-parameter cap once the catalogue is big enough.
  const grouped = await inChunks(filmIds, (batch) =>
    db.rating.groupBy({
      by: ["filmId"],
      where: { filmId: { in: batch } },
      _avg: { overall: true },
      _count: { _all: true },
    }),
  );

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

export type FilmFilters = {
  sort?: FilmSort;
  genre?: string;
  country?: string;
  decade?: number;
  search?: string;
  reviewed?: boolean;
};

/** Films per page in the catalogue. */
export const PAGE_SIZE = 60;

/** The `where` every catalogue query shares, so filters can't drift apart. */
function filmWhere({ genre, country, decade, search, reviewed }: FilmFilters) {
  return {
    ...(reviewed ? { reviewed: true } : {}),
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
  };
}

/**
 * Two of the four sorts can be done by the database, and two cannot.
 *
 * `new` and `az` are plain column sorts, so SQLite orders them and pagination
 * is a straight LIMIT/OFFSET. `trending` and `rated` rank on values that
 * don't live on the row — rating volume and the community average, which
 * come from a groupBy over Rating — so they're sorted in JS afterwards. That
 * distinction is the whole reason this function exists: paginating those two
 * at the database level would take the wrong 60 rows and *then* sort them,
 * so every page would be ranked only against itself.
 */
const DB_SORTED: FilmSort[] = ["new", "az"];

/**
 * Film rows to the summary shape every card, row and carousel on the site
 * takes — community averages and editorial counts zipped on in two queries
 * rather than two per film. Exported because the trending row starts from a
 * TMDB ranking rather than from one of the sorts below (see lib/trending.ts)
 * and still has to end up with exactly the same objects.
 */
export async function summariseFilms(
  films: Awaited<ReturnType<typeof db.film.findMany>>,
): Promise<FilmSummary[]> {
  const [scores, editorial] = await Promise.all([
    communityScores(films.map((f) => f.id)),
    editorialCounts(),
  ]);

  return films.map((film) => {
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
      reviewed: film.reviewed,
      tmdbScore: film.tmdbScore,
      reviewCount: editorial.get(film.slug) ?? 0,
    };
  });
}

function rankInJs(summaries: FilmSummary[], sort: FilmSort) {
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
    // Reviewed films rank on XINE's own scores; imported ones fall back to
    // TMDB's average so the tail still orders sensibly instead of collapsing.
    const rank = (f: FilmSummary) =>
      f.communityScore ?? f.criticScore ?? f.tmdbScore ?? 0;
    summaries.sort(
      (a, b) => rank(b) - rank(a) || b.ratingCount - a.ratingCount,
    );
  }
  return summaries;
}

function dbOrder(sort: FilmSort) {
  return sort === "new"
    ? [{ year: "desc" as const }, { title: "asc" as const }]
    : sort === "az"
      ? [{ title: "asc" as const }]
      : [{ criticScore: "desc" as const }, { title: "asc" as const }];
}

export async function listFilms({
  sort = "trending",
  take = 120,
  ...filters
}: FilmFilters & { take?: number } = {}): Promise<FilmSummary[]> {
  const films = await db.film.findMany({
    where: filmWhere(filters),
    orderBy: dbOrder(sort),
    take,
  });
  return rankInJs(await summariseFilms(films), sort);
}

/**
 * One page of the catalogue, plus the total so the pager knows how far it
 * goes. Page numbers are 1-based and clamped, so a hand-typed ?page=999
 * lands on the last page rather than an empty grid.
 */
export async function browseFilms(
  { sort = "trending", ...filters }: FilmFilters,
  page = 1,
): Promise<{
  films: FilmSummary[];
  total: number;
  page: number;
  pages: number;
}> {
  const where = filmWhere(filters);
  const total = await db.film.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const skip = (current - 1) * PAGE_SIZE;

  if (DB_SORTED.includes(sort)) {
    const films = await db.film.findMany({
      where,
      orderBy: dbOrder(sort),
      skip,
      take: PAGE_SIZE,
    });
    return { films: await summariseFilms(films), total, page: current, pages };
  }

  // Ranked in JS, so the whole filtered set has to be ordered before it can
  // be sliced. ~1,300 rows: cheap enough, and correct, which the alternative
  // is not.
  const all = rankInJs(await summariseFilms(await db.film.findMany({ where })), sort);
  return {
    films: all.slice(skip, skip + PAGE_SIZE),
    total,
    page: current,
    pages,
  };
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
        include: {
          list: { select: { slug: true, title: true, editorial: true } },
        },
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

/**
 * The catalogue stated as figures, for the homepage band.
 *
 * Four numbers rather than a dashboard: how much there is, how far it
 * reaches, how far back it goes, and how much of it XINE has actually
 * written about — that last one being the only honest way to say that
 * breadth and editorial weight are different things here.
 */
export async function catalogueStats() {
  const [titles, series, reviewed, span, countryRows] = await Promise.all([
    db.film.count(),
    db.film.count({ where: { kind: "series" } }),
    db.film.count({ where: { reviewed: true } }),
    db.film.aggregate({ _min: { year: true }, _max: { year: true } }),
    db.film.findMany({
      where: { originCountry: { not: null } },
      select: { originCountry: true },
    }),
  ]);

  // originCountry is a comma-separated list and the first code is home; a
  // co-production is counted once, where it is from.
  const countries = new Set(
    countryRows
      .map((row) => row.originCountry?.split(",")[0]?.trim())
      .filter((code): code is string => Boolean(code)),
  );

  return {
    titles,
    films: titles - series,
    series,
    reviewed,
    countries: countries.size,
    earliest: span._min.year ?? null,
    latest: span._max.year ?? null,
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
