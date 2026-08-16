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
};

type TmdbCredits = {
  crew: { job: string; name: string }[];
  cast: { name: string }[];
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

export async function getMovie(id: number) {
  return request<TmdbMovie>(`/movie/${id}`, withV3Key({}));
}

export async function getCredits(id: number) {
  return request<TmdbCredits>(`/movie/${id}/credits`, withV3Key({}));
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
    cast: credits.cast.slice(0, 6).map((c) => c.name).join(", "),
    director: crewJob("Director") ?? "Unknown",
    cinematographer: crewJob("Director of Photography"),
    composer: crewJob("Original Music Composer"),
    posterUrl: posterUrl(movie.poster_path),
    backdropUrl: backdropUrl(movie.backdrop_path),
    language: movie.original_language ?? null,
    releasedAt: movie.release_date ? new Date(movie.release_date) : null,
  };
}
