import "server-only";
import { unstable_cache } from "next/cache";

/**
 * A cache for the handful of queries that summarise the whole catalogue —
 * the filter rail, the homepage figures, the recommender's rarity table.
 *
 * Each one is a scan over every film, each one is on a hot path, and none of
 * them changes between imports: the set of genres in seventy thousand films
 * is the same set it was a minute ago.
 *
 * This used to be a process-local Map with a deadline, and that was wrong for
 * where the code actually runs. A Map is only a cache if the process outlives
 * the request; on serverless, most requests arrive at an instance that has
 * never seen one, so nearly every visitor paid the full cost of eight
 * group-bys and the "cache" only ever helped whoever came second. Next's data
 * cache is shared across instances and survives a cold start, which is the
 * whole property that was missing.
 *
 * The call signature is unchanged, so callers did not have to learn anything
 * about why it got faster.
 */

/**
 * Ten minutes: long enough to matter, short enough that an import shows up.
 * Expressed in milliseconds because that is what the call sites already pass.
 */
export const CATALOGUE_TTL = 10 * 60 * 1000;

export function memo<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  // Keyed on the caller's name alone: these are whole-catalogue summaries
  // with no arguments, which is exactly the case this helper is for. Anything
  // that varies per request has no business in a shared cache.
  return unstable_cache(load, [key], {
    revalidate: Math.max(1, Math.round(ttlMs / 1000)),
    tags: ["catalogue"],
  })();
}
