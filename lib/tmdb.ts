/**
 * TMDB is optional. Without a key the app runs entirely on the seeded
 * catalogue and draws type plates instead of poster art; with one, films can
 * be enriched and imported. Nothing in the UI branches on this — the only
 * difference is whether `Film.posterUrl` is populated.
 *
 * Using TMDB in production requires attribution and compliance with their
 * terms; the footer carries the notice when a key is configured.
 */

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

async function request<T>(path: string, params: Record<string, string> = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // A v4 read access token goes in the Authorization header; a legacy v3 key
  // goes in the query string, added by withV3Key at the call site.
  const res = await fetch(url, {
    headers: {
      ...(key.startsWith("ey") ? { Authorization: `Bearer ${key}` } : {}),
      accept: "application/json",
    },
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
      sort_by: "vote_average.desc",
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
      sort_by: "vote_average.desc",
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
    genres: (series.genres ?? []).map((g) => g.name).join(", "),
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
      genres: (data.genres ?? []).map((g) => g.name),
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
    genres: (movie.genres ?? []).map((g) => g.name).join(", "),
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
