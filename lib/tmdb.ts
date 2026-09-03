/**
 * TMDB is optional. Without a key the app runs entirely on the seeded
 * catalogue and draws type plates instead of poster art; with one, films can
 * be enriched and imported. Nothing in the UI branches on this — the only
 * difference is whether `Film.posterUrl` is populated.
 *
 * Using TMDB in production requires attribution and compliance with their
 * terms; the footer carries the notice when a key is configured.
 */

import { genreCsv, normaliseGenres } from "@/lib/genres";

const BASE = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";

export function tmdbConfigured(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
}

type TmdbMovie = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime?: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres?: { id: number; name: string }[];
  original_language?: string;
  production_countries?: { iso_3166_1: string; name: string }[];
  origin_country?: string[];
  vote_average?: number;
  vote_count?: number;
};

/**
 * TMDB's movie genre ids. Stable for years, and hardcoding them avoids a
 * round trip to /genre/movie/list on every discover call.
 */
export const TMDB_GENRES: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Science Fiction": 878,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

type TmdbCredits = {
  crew: { job: string; name: string }[];
  cast: {
    id: number;
    name: string;
    character?: string | null;
    profile_path?: string | null;
    /// Billing order — 0 is top-billed.
    order?: number;
  }[];
};

/** One billed performer, in the shape lib/people.ts wants to store. */
export type TmdbCastMember = {
  tmdbId: number;
  name: string;
  character: string | null;
  profileUrl: string | null;
  order: number;
};

async function request<T>(
  path: string,
  params: Record<string, string> = {},
  options: { revalidate?: number } = {},
) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // A v4 read access token goes in the Authorization header; a legacy v3 key
  // goes in the query string, added by withV3Key at the call site.
  //
  // `revalidate` is only meaningful when a Next request handler is what is
  // calling — in a tsx script the option is inert, which is why the callers
  // that page through TMDB in bulk simply omit it.
  const res = await fetch(url, {
    headers: {
      ...(key.startsWith("ey") ? { Authorization: `Bearer ${key}` } : {}),
      accept: "application/json",
    },
    ...(options.revalidate === undefined
      ? {}
      : { next: { revalidate: options.revalidate } }),
  });

  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function withV3Key(params: Record<string, string>) {
  const key = process.env.TMDB_API_KEY ?? "";
  return key.startsWith("ey") ? params : { ...params, api_key: key };
}

/**
 * What the world is watching, straight from TMDB.
 *
 * Trending is the one thing on this site the catalogue cannot answer on its
 * own: XINE ranks by how much its own members are rating something, which is
 * a claim about the catalogue rather than about this week. So the homepage
 * row asks TMDB and the catalogue supplies the pages — see lib/trending.ts
 * for how the two are joined, and scripts/sync-trending.ts for how a title
 * that trends without being in the catalogue gets in.
 *
 * `media: "all"` mixes films and series, which is correct here: this site
 * treats them as one medium and rates them on the same five axes.
 */
export type TrendingTitle = {
  tmdbId: number;
  kind: "film" | "series";
  title: string;
  year: number | null;
  voteAverage: number | null;
  voteCount: number;
  /** Position in TMDB's ranking, 1-based and stable across the pages read. */
  rank: number;
};

type TrendingRow = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
};

/** Six hours. Trending moves daily at most, and the row is on every visit. */
const TRENDING_TTL = 60 * 60 * 6;

export async function fetchTrending(
  options: {
    media?: "movie" | "tv" | "all";
    window?: "day" | "week";
    pages?: number;
    revalidate?: number;
  } = {},
): Promise<TrendingTitle[]> {
  const media = options.media ?? "all";
  const window = options.window ?? "week";
  // TMDB serves 20 a page and the ranking is meaningless past the first
  // hundred or so, so this is capped rather than paged to exhaustion.
  const pages = Math.max(1, Math.min(options.pages ?? 1, 5));

  const rows: TrendingRow[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await request<{ results: TrendingRow[] }>(
      `/trending/${media}/${window}`,
      withV3Key({ page: String(page) }),
      { revalidate: options.revalidate ?? TRENDING_TTL },
    );
    if (!data.results?.length) break;
    rows.push(...data.results);
  }

  const seen = new Set<string>();
  const titles: TrendingTitle[] = [];

  for (const row of rows) {
    // /trending/all returns "movie" | "tv" | "person" — people are not
    // titles, and the single-media endpoints label their rows too, so this
    // one field decides both what a row is and whether to keep it.
    const type = row.media_type ?? (media === "tv" ? "tv" : "movie");
    if (type !== "movie" && type !== "tv") continue;

    const kind = type === "tv" ? ("series" as const) : ("film" as const);
    const key = `${kind}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const date = row.release_date || row.first_air_date || "";
    titles.push({
      tmdbId: row.id,
      kind,
      title: row.title ?? row.name ?? "Untitled",
      year: date ? Number(date.slice(0, 4)) : null,
      voteAverage: row.vote_average ?? null,
      voteCount: row.vote_count ?? 0,
      rank: titles.length + 1,
    });
  }

  return titles;
}

export function posterUrl(path: string | null, size: "w500" | "w780" = "w500") {
  return path ? `${IMAGE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null) {
  return path ? `${IMAGE}/w1280${path}` : null;
}

/**
 * Headshots. h632 rather than w185: the cast accordion renders a panel over
 * 300px tall, and w185 was being upscaled ~6x by the image optimiser — a
 * blurred crop of somebody's forehead. h632 is TMDB's tall profile size
 * (~421x632), which covers the panel at native resolution.
 */
export function profileUrl(path: string | null | undefined) {
  return path ? `${IMAGE}/h632${path}` : null;
}

/**
 * Billed cast for a title, film or series, normalised.
 *
 * `order` is TMDB's billing position and the only thing that separates a
 * lead from a background part — without it every credit would look equally
 * important, which is exactly what a "main characters" section must not do.
 * TMDB occasionally omits it; those fall to the back rather than the front.
 */
export async function fetchCast(
  id: number,
  kind: "film" | "series" = "film",
): Promise<TmdbCastMember[]> {
  const path = kind === "series" ? `/tv/${id}/credits` : `/movie/${id}/credits`;
  const credits = await request<TmdbCredits>(path, withV3Key({}));

  return (credits.cast ?? []).map((member, index) => ({
    tmdbId: member.id,
    name: member.name,
    character: member.character?.trim() || null,
    profileUrl: profileUrl(member.profile_path),
    order: member.order ?? index,
  }));
}

export async function searchMovie(title: string, year?: number) {
  const data = await request<{ results: TmdbMovie[] }>(
    "/search/movie",
    withV3Key({
      query: title,
      ...(year ? { primary_release_year: String(year) } : {}),
      include_adult: "false",
    }),
  );
  return data.results[0] ?? null;
}

/** Title search across TV, for references that turn out to be series. */
export async function searchSeries(name: string, year?: number) {
  const data = await request<{ results: (TmdbMovie & { name?: string })[] }>(
    "/search/tv",
    withV3Key({
      query: name,
      ...(year ? { first_air_date_year: String(year) } : {}),
      include_adult: "false",
    }),
  );
  return data.results[0] ?? null;
}

/**
 * Candidate matches for a title, across film or TV, in one normalised shape.
 *
 * `searchMovie` above returns TMDB's first result, which is right when the
 * caller already knows what it is looking at and wrong when it is resolving
 * a name. TMDB ranks by popularity within the year filter, and for an older
 * title that means a straight-to-nothing release with zero votes can outrank
 * the film everybody means: searching "Audition" in 1999 returns "Auditions
 * from Beyond" before Miike. So this returns the field and lets the caller
 * score it — see scripts/seed-collections.ts.
 *
 * Both the year-scoped and unscoped searches are run and merged, because
 * TMDB dates a good number of titles by festival or by re-release, and a
 * year filter turns those into no result at all rather than a worse one.
 */
export type TitleMatch = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number;
  /** Ready to render — the catalogue never sees the bare path. */
  posterUrl: string | null;
};

export async function searchTitles(
  query: string,
  kind: "film" | "series" = "film",
  year?: number,
): Promise<TitleMatch[]> {
  const path = kind === "series" ? "/search/tv" : "/search/movie";
  const yearKey =
    kind === "series" ? "first_air_date_year" : "primary_release_year";

  type Row = {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    poster_path?: string | null;
  };

  const pages = await Promise.all(
    [
      ...(year ? [{ [yearKey]: String(year) }] : []),
      {},
    ].map((extra) =>
      request<{ results: Row[] }>(
        path,
        withV3Key({ query, include_adult: "false", ...extra }),
      ).catch(() => ({ results: [] as Row[] })),
    ),
  );

  const seen = new Set<number>();
  const matches: TitleMatch[] = [];

  for (const page of pages) {
    for (const row of page.results ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const date = row.release_date || row.first_air_date || "";
      matches.push({
        tmdbId: row.id,
        title: row.title ?? row.name ?? "",
        originalTitle: row.original_title ?? row.original_name ?? null,
        year: date ? Number(date.slice(0, 4)) : null,
        voteAverage: row.vote_average ?? null,
        voteCount: row.vote_count ?? 0,
        popularity: row.popularity ?? 0,
        posterUrl: posterUrl(row.poster_path ?? null),
      });
    }
  }

  return matches;
}

export async function getMovie(id: number) {
  return request<TmdbMovie>(`/movie/${id}`, withV3Key({}));
}

export async function getCredits(id: number) {
  return request<TmdbCredits>(`/movie/${id}/credits`, withV3Key({}));
}

export type DiscoverParams = {
  genres?: string[];
  excludeGenres?: string[];
  keywords?: string[];
  yearFrom?: number;
  yearTo?: number;
  maxRuntime?: number;
  minRuntime?: number;
  language?: string;
  minVotes?: number;
  sortBy?: "popularity" | "rating" | "revenue" | "newest";
  limit?: number;
};

const SORT_MAP: Record<string, string> = {
  popularity: "popularity.desc",
  rating: "vote_average.desc",
  revenue: "revenue.desc",
  newest: "primary_release_date.desc",
};

/** Resolve free-text keywords to TMDB keyword ids so discover can filter on them. */
async function keywordIds(keywords: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const keyword of keywords.slice(0, 4)) {
    try {
      const data = await request<{ results: { id: number; name: string }[] }>(
        "/search/keyword",
        withV3Key({ query: keyword }),
      );
      if (data.results[0]) ids.push(String(data.results[0].id));
    } catch {
      // A keyword that resolves to nothing simply drops out of the filter.
    }
  }
  return ids;
}

/**
 * Structured search across all of TMDB — the breadth counterpart to the
 * catalogue queries. Keyword filters are ANDed, which is aggressive, so the
 * caller should pass few and specific ones.
 */
export async function discoverMovies(params: DiscoverParams) {
  const query: Record<string, string> = {
    include_adult: "false",
    "vote_count.gte": String(params.minVotes ?? 200),
    sort_by: SORT_MAP[params.sortBy ?? "rating"],
  };

  if (params.genres?.length) {
    const ids = params.genres
      .map((g) => TMDB_GENRES[g])
      .filter((id): id is number => Boolean(id));
    if (ids.length) query.with_genres = ids.join(",");
  }
  if (params.excludeGenres?.length) {
    const ids = params.excludeGenres
      .map((g) => TMDB_GENRES[g])
      .filter((id): id is number => Boolean(id));
    if (ids.length) query.without_genres = ids.join(",");
  }
  if (params.keywords?.length) {
    const ids = await keywordIds(params.keywords);
    if (ids.length) query.with_keywords = ids.join(",");
  }
  if (params.yearFrom)
    query["primary_release_date.gte"] = `${params.yearFrom}-01-01`;
  if (params.yearTo)
    query["primary_release_date.lte"] = `${params.yearTo}-12-31`;
  if (params.maxRuntime) query["with_runtime.lte"] = String(params.maxRuntime);
  if (params.minRuntime) query["with_runtime.gte"] = String(params.minRuntime);
  if (params.language) query.with_original_language = params.language;

  const data = await request<{ results: TmdbMovie[] }>(
    "/discover/movie",
    withV3Key(query),
  );

  return data.results.slice(0, Math.min(params.limit ?? 12, 20));
}

/**
 * What is coming, by date, for the release calendar.
 *
 * Discover rather than /movie/upcoming: that endpoint is scoped to one
 * region and stops a few weeks out, and a calendar that only knows about the
 * next fortnight is a listings page.
 *
 * Ranked by popularity inside the date window rather than by date, which
 * looks wrong for a calendar and is the only ordering that works. There are
 * three thousand films dated in the next nine months; sorted by date, the
 * first hundred are regional uploads with a popularity of 0.0 and the
 * calendar never reaches Avengers. Popularity picks the titles anyone is
 * waiting for, and the calendar sorts them back into date order itself.
 *
 * Nothing has votes before it opens, so the usual quality bar cannot apply —
 * the popularity floor and a poster are what stand in for it.
 */
export async function discoverUpcoming(options: {
  kind: "film" | "series";
  from: Date;
  to: Date;
  page: number;
  minPopularity?: number;
}): Promise<{ rows: TitleMatch[]; totalPages: number }> {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const series = options.kind === "series";

  type Row = {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    poster_path?: string | null;
  };

  const data = await request<{ results: Row[]; total_pages: number }>(
    series ? "/discover/tv" : "/discover/movie",
    withV3Key({
      include_adult: "false",
      sort_by: "popularity.desc",
      [series ? "first_air_date.gte" : "primary_release_date.gte"]: day(
        options.from,
      ),
      [series ? "first_air_date.lte" : "primary_release_date.lte"]: day(
        options.to,
      ),
      // Theatrical and digital releases only, so the film calendar is not
      // filled with festival premieres nobody can buy a ticket to.
      ...(series ? {} : { with_release_type: "2|3|4" }),
      ...(series ? { without_genres: "10763,10764,10767" } : {}),
      page: String(options.page),
    }),
  );

  const floor = options.minPopularity ?? 4;

  const rows = (data.results ?? [])
    .filter((row) => (row.popularity ?? 0) >= floor && row.poster_path)
    .map((row) => {
      const date = row.release_date || row.first_air_date || "";
      return {
        tmdbId: row.id,
        title: row.title ?? row.name ?? "",
        originalTitle: row.original_title ?? row.original_name ?? null,
        year: date ? Number(date.slice(0, 4)) : null,
        voteAverage: row.vote_average ?? null,
        voteCount: row.vote_count ?? 0,
        popularity: row.popularity ?? 0,
        posterUrl: posterUrl(row.poster_path ?? null),
      };
    });

  return { rows, totalPages: data.total_pages ?? 0 };
}

export type DiscoverRow = {
  id: number;
  title: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
};

/**
 * One page of discover results for a set of origin countries. Separate from
 * discoverMovies because the importer pages through by country and score
 * rather than by the taste filters the agent uses.
 */
export async function discoverPage(options: {
  countries: string[];
  minScore: number;
  minVotes: number;
  yearFrom: number;
  page: number;
  /** Rating-ranked by default; the importer's reach pass counts votes. */
  sort?: "vote_average.desc" | "vote_count.desc";
}) {
  const data = await request<{ results: DiscoverRow[]; total_pages: number }>(
    "/discover/movie",
    withV3Key({
      include_adult: "false",
      // A pipe is OR in TMDB's filter syntax — any of these origin countries.
      with_origin_country: options.countries.join("|"),
      "vote_average.gte": String(options.minScore),
      "vote_count.gte": String(options.minVotes),
      "primary_release_date.gte": `${options.yearFrom}-01-01`,
      // Feature films only. Without this the rating-ranked results fill with
      // concert films, making-of specials and fan releases — small devoted
      // audiences rate them 9/10 and they crowd out actual cinema.
      "with_runtime.gte": "60",
      without_genres: `${TMDB_GENRES.Music},10770`, // Music, TV Movie
      // Rating-ranked, not popularity-ranked. Sorting by vote count fills the
      // catalogue with franchise blockbusters; sorting by average against a
      // vote floor surfaces what people actually rate highly, which is the
      // only ordering an editorial catalogue can defend.
      sort_by: options.sort ?? "vote_average.desc",
      page: String(options.page),
    }),
  );

  return { rows: data.results ?? [], totalPages: data.total_pages ?? 0 };
}

type TmdbSeries = {
  id: number;
  name: string;
  original_name: string;
  production_countries?: { iso_3166_1: string }[];
  overview: string;
  first_air_date?: string;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres?: { id: number; name: string }[];
  original_language?: string;
  created_by?: { name: string }[];
  vote_average?: number;
  vote_count?: number;
};

/** One page of TV discover results, mirroring discoverPage for films. */
export async function discoverTvPage(options: {
  countries: string[];
  minScore: number;
  minVotes: number;
  yearFrom: number;
  page: number;
  /** Rating-ranked by default; the importer's reach pass counts votes. */
  sort?: "vote_average.desc" | "vote_count.desc";
}) {
  const data = await request<{
    results: (DiscoverRow & { name?: string; first_air_date?: string })[];
    total_pages: number;
  }>(
    "/discover/tv",
    withV3Key({
      include_adult: "false",
      with_origin_country: options.countries.join("|"),
      "vote_average.gte": String(options.minScore),
      "vote_count.gte": String(options.minVotes),
      "first_air_date.gte": `${options.yearFrom}-01-01`,
      sort_by: options.sort ?? "vote_average.desc",
      // Talk shows and news drown out drama otherwise.
      without_genres: "10763,10767,10764", // News, Talk, Reality
      page: String(options.page),
    }),
  );

  return {
    rows: (data.results ?? []).map((row) => ({
      ...row,
      title: row.name ?? row.title,
      release_date: row.first_air_date,
    })),
    totalPages: data.total_pages ?? 0,
  };
}

/**
 * When a running series comes back.
 *
 * The calendar's first cut only knew about first appearances, because that
 * is what a release date is — so it listed brand new shows and missed season
 * four of the thing everybody is actually waiting for. TMDB carries the
 * answer on the series itself: `next_episode_to_air` is the next dated
 * episode, and its season number is what a viewer means by "it's back".
 *
 * Returns null when nothing is scheduled, which is the common case: most
 * series in a catalogue this size have either ended or not been renewed.
 */
export async function fetchNextSeason(
  tmdbId: number,
): Promise<{ season: number; airsAt: Date } | null> {
  type Episode = {
    air_date?: string | null;
    season_number?: number | null;
    episode_number?: number | null;
  };

  const data = await request<{
    next_episode_to_air?: Episode | null;
    status?: string;
  }>(`/tv/${tmdbId}`, withV3Key({}));

  const next = data.next_episode_to_air;
  if (!next?.air_date || next.season_number == null) return null;

  const airsAt = new Date(next.air_date);
  if (Number.isNaN(airsAt.getTime())) return null;

  return { season: next.season_number, airsAt };
}

/** Everything the Film model wants for a series. */
export async function fetchSeriesDetail(id: number) {
  const series = await request<TmdbSeries & { credits?: TmdbCredits }>(
    `/tv/${id}`,
    withV3Key({ append_to_response: "credits" }),
  );

  // A series has no single director, so the creator is the authorial credit —
  // falling back to an executive producer when TMDB has no creator listed.
  const creators = (series.created_by ?? []).map((c) => c.name);
  const fallback = series.credits?.crew.find(
    (c) => c.job === "Executive Producer",
  )?.name;

  return {
    tmdbId: series.id,
    title: series.name,
    originalTitle:
      series.original_name !== series.name ? series.original_name : null,
    year: series.first_air_date ? Number(series.first_air_date.slice(0, 4)) : 0,
    runtime: series.episode_run_time?.[0] ?? null,
    seasons: series.number_of_seasons ?? null,
    episodes: series.number_of_episodes ?? null,
    synopsis: series.overview,
    genres: genreCsv((series.genres ?? []).map((g) => g.name)),
    cast: (series.credits?.cast ?? [])
      .slice(0, 6)
      .map((c) => c.name)
      .join(", "),
    director: creators.join(", ") || fallback || "Unknown",
    cinematographer: null,
    composer: null,
    posterUrl: posterUrl(series.poster_path),
    backdropUrl: backdropUrl(series.backdrop_path),
    language: series.original_language ?? null,
    productionCountries: productionCountries(series),
    originCountry: originCountry(series),
    releasedAt: series.first_air_date ? new Date(series.first_air_date) : null,
  };
}

type WatchProviders = {
  results: Record<
    string,
    {
      flatrate?: { provider_name: string }[];
      free?: { provider_name: string }[];
    }
  >;
};

/**
 * Detail plus streaming availability in one call, via append_to_response.
 * Availability is the one claim the agent must never guess at, so it either
 * comes from here or is reported as unknown.
 */
export async function movieWithProviders(id: number, region: string) {
  try {
    const data = await request<
      TmdbMovie & { credits: TmdbCredits; "watch/providers": WatchProviders }
    >(
      `/movie/${id}`,
      withV3Key({ append_to_response: "credits,watch/providers" }),
    );

    const regional = data["watch/providers"]?.results?.[region];
    const providers = [
      ...(regional?.flatrate ?? []),
      ...(regional?.free ?? []),
    ].map((p) => p.provider_name);

    return {
      runtime: data.runtime ?? null,
      genres: normaliseGenres((data.genres ?? []).map((g) => g.name)),
      director:
        data.credits?.crew.find((c) => c.job === "Director")?.name ?? null,
      providers: [...new Set(providers)],
    };
  } catch {
    return null;
  }
}

/** Everything the Film model wants, pulled in one go. */
export async function fetchFilmDetail(id: number) {
  const [movie, credits] = await Promise.all([getMovie(id), getCredits(id)]);
  const crewJob = (job: string) =>
    credits.crew.find((c) => c.job === job)?.name ?? null;

  return {
    tmdbId: movie.id,
    title: movie.title,
    originalTitle:
      movie.original_title !== movie.title ? movie.original_title : null,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : 0,
    runtime: movie.runtime ?? null,
    synopsis: movie.overview,
    // Through the house vocabulary on the way out, so nothing downstream
    // ever sees TMDB's two genre spaces — see lib/genres.ts.
    genres: genreCsv((movie.genres ?? []).map((g) => g.name)),
    cast: credits.cast
      .slice(0, 6)
      .map((c) => c.name)
      .join(", "),
    director: crewJob("Director") ?? "Unknown",
    cinematographer: crewJob("Director of Photography"),
    composer: crewJob("Original Music Composer"),
    posterUrl: posterUrl(movie.poster_path),
    backdropUrl: backdropUrl(movie.backdrop_path),
    language: movie.original_language ?? null,
    productionCountries: productionCountries(movie),
    originCountry: originCountry(movie),
    releasedAt: movie.release_date ? new Date(movie.release_date) : null,
  };
}

/**
 * Where a film was actually made, as ISO codes.
 *
 * `production_countries` is the authoritative list; `origin_country` is the
 * fallback TMDB fills in for some titles when the former is empty. Both are
 * real production metadata, unlike the region label the importer pages by.
 */
/**
 * Where the film is FROM. Falls back to the production list only when TMDB
 * has no origin, so a co-production financed from four countries still
 * reports the one it actually belongs to.
 */
export function originCountry(movie: {
  origin_country?: string[];
  production_countries?: { iso_3166_1: string }[];
}): string | null {
  const origin = (movie.origin_country ?? []).map((c) => c?.toUpperCase()).filter(Boolean);
  if (origin.length) return [...new Set(origin)].join(",");
  const first = movie.production_countries?.[0]?.iso_3166_1;
  return first ? first.toUpperCase() : null;
}

export function productionCountries(movie: {
  production_countries?: { iso_3166_1: string }[];
  origin_country?: string[];
}): string | null {
  const codes = (movie.production_countries ?? [])
    .map((c) => c.iso_3166_1)
    .concat(movie.origin_country ?? [])
    .map((c) => c?.toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(codes)];
  return unique.length ? unique.join(",") : null;
}
