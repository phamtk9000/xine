/**
 * Splitting `IN (...)` queries so they stay under SQLite's parameter cap.
 *
 * SQLite binds every element of an `in:` list as a separate parameter, and
 * refuses the statement past a compiled-in limit — commonly 999. Prisma gives
 * no warning; the query simply fails at runtime with "The query parameter
 * limit supported by your database is exceeded", and only once the catalogue
 * has grown past the line. The `trending` and `rated` sorts rank in JS, so
 * they legitimately ask for community scores across every filtered film at
 * once — at 1267 films that is 1267 parameters in one statement.
 *
 * 500 rather than 999, because the cap covers the *whole* statement and these
 * queries carry other bound values besides the id list.
 *
 * No dependency on the client or `server-only`, so scripts can use it too.
 */
export const PARAM_LIMIT = 500;

export function chunk<T>(items: T[], size = PARAM_LIMIT): T[][] {
  if (items.length <= size) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Run a query once per batch and concatenate the rows. Batches go in
 * parallel: they are independent reads, and the whole point is to keep a
 * large page from costing a serial round trip per 500 films.
 */
export async function inChunks<T, R>(
  items: T[],
  run: (batch: T[]) => Promise<R[]>,
  size = PARAM_LIMIT,
): Promise<R[]> {
  const batches = chunk(items, size);
  if (batches.length === 0) return [];
  if (batches.length === 1) return run(batches[0]);
  return (await Promise.all(batches.map(run))).flat();
}
