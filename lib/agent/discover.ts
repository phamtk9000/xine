import "server-only";
import {
  discoverMovies,
  movieWithProviders,
  searchMovie,
  tmdbConfigured,
  type DiscoverParams,
} from "@/lib/tmdb";
import { db } from "@/lib/db";

/**
 * The breadth half of the recommendation engine.
 *
 * The curated catalogue is deep — six rating axes, community reviews, our own
 * synopses — but it is 31 films. TMDB is the opposite: everything ever
 * released, and nothing editorial. The agent gets both and is told which is
 * which, so it can reach outside when the catalogue genuinely cannot serve a
 * request without pretending an outside film has XINE data behind it.
 */

export type ExternalCandidate = {
  source: "tmdb";
  tmdbId: number;
  slug: string | null; // set when we already hold this film
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  genres: string[];
  language: string | null;
  overview: string;
  posterUrl: string | null;
  voteAverage: number | null;
  voteCount: number;
  providers: string[];
  providerRegion: string | null;
};

export function discoverConfigured() {
  return tmdbConfigured();
}

/** Which region's streaming availability to report. */
export function watchRegion() {
  return (process.env.TMDB_WATCH_REGION ?? "US").toUpperCase();
}

/**
 * Anything TMDB returns that we already hold gets its slug attached, so the
 * agent can prefer the catalogue copy and the UI can link to a real film page.
 */
async function attachKnownSlugs(candidates: ExternalCandidate[]) {
  const ids = candidates.map((c) => c.tmdbId);
  if (ids.length === 0) return candidates;

  const known = await db.film.findMany({
    where: { tmdbId: { in: ids } },
    select: { tmdbId: true, slug: true },
  });
  const bySlug = new Map(known.map((f) => [f.tmdbId, f.slug]));

  return candidates.map((c) => ({ ...c, slug: bySlug.get(c.tmdbId) ?? null }));
}

export async function discoverExternal(
  params: DiscoverParams,
  options: { withProviders?: boolean } = {},
): Promise<ExternalCandidate[]> {
  const region = watchRegion();
  const movies = await discoverMovies(params);

  const candidates: ExternalCandidate[] = [];
  for (const movie of movies) {
    // Providers cost a request each, so only fetch them for the handful the
    // agent is actually weighing rather than every discover result.
    const detail = options.withProviders
      ? await movieWithProviders(movie.id, region)
      : null;

    candidates.push({
      source: "tmdb",
      tmdbId: movie.id,
      slug: null,
      title: movie.title,
      year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
      director: detail?.director ?? null,
      runtime: detail?.runtime ?? movie.runtime ?? null,
      genres: detail?.genres ?? [],
      language: movie.original_language ?? null,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
      voteAverage: movie.vote_average ?? null,
      voteCount: movie.vote_count ?? 0,
      providers: detail?.providers ?? [],
      providerRegion: detail ? region : null,
    });
  }

  return attachKnownSlugs(candidates);
}

/** Look up one title by name — used when the reader names a reference film. */
export async function lookupExternal(
  title: string,
  year?: number,
): Promise<ExternalCandidate | null> {
  const match = await searchMovie(title, year);
  if (!match) return null;

  const region = watchRegion();
  const detail = await movieWithProviders(match.id, region);

  const [candidate] = await attachKnownSlugs([
    {
      source: "tmdb",
      tmdbId: match.id,
      slug: null,
      title: match.title,
      year: match.release_date ? Number(match.release_date.slice(0, 4)) : null,
      director: detail?.director ?? null,
      runtime: detail?.runtime ?? null,
      genres: detail?.genres ?? [],
      language: match.original_language ?? null,
      overview: match.overview,
      posterUrl: match.poster_path
        ? `https://image.tmdb.org/t/p/w500${match.poster_path}`
        : null,
      voteAverage: match.vote_average ?? null,
      voteCount: match.vote_count ?? 0,
      providers: detail?.providers ?? [],
      providerRegion: detail ? region : null,
    },
  ]);

  return candidate;
}

/** Compact line for the model. */
export function summariseExternal(c: ExternalCandidate): string {
  return [
    `tmdb:${c.tmdbId} | ${c.title}${c.year ? ` (${c.year})` : ""}`,
    c.director ? `dir ${c.director}` : null,
    c.genres.length ? c.genres.join("/") : null,
    c.runtime ? `${c.runtime}min` : null,
    c.language,
    c.voteAverage ? `tmdb ${c.voteAverage.toFixed(1)} (${c.voteCount} votes)` : null,
    c.slug ? `IN CATALOGUE as ${c.slug}` : "not in catalogue",
    c.providers.length ? `streaming ${c.providerRegion}: ${c.providers.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}
