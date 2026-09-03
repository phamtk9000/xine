import "server-only";

/**
 * A tiny in-process cache with a time limit.
 *
 * For the handful of queries that summarise the whole catalogue — the filter
 * rail, the homepage figures, the recommender's rarity table. Each one is a
 * scan, each one is on a hot path, and none of them changes between imports:
 * the set of genres in a hundred thousand films is the same set it was a
 * minute ago.
 *
 * Deliberately not Next's data cache. These are cheap objects derived from
 * the database rather than fetches to tag and revalidate, and a process-local
 * Map with a deadline is the whole requirement. It empties on deploy, which
 * is the only invalidation anybody needs — an import changes the numbers, and
 * an import is followed by a deploy or by a stale minute, neither of which
 * matters for a count of decades.
 *
 * In-flight calls share one promise, so a cold cache under concurrent
 * requests runs the query once rather than once per request.
 */

type Entry = { value: Promise<unknown>; expires: number };

const store = new Map<string, Entry>();

export function memo<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const value = load().catch((error) => {
    // A failed load must not be cached, or one blip poisons the key for the
    // rest of the TTL.
    store.delete(key);
    throw error;
  });

  store.set(key, { value, expires: now + ttlMs });
  return value;
}

/** Ten minutes: long enough to matter, short enough that an import shows up. */
export const CATALOGUE_TTL = 10 * 60 * 1000;
