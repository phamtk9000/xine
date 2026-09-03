import "server-only";
import { db } from "@/lib/db";
import type { Vector } from "@/lib/rec/dimensions";
import {
  deriveProfile,
  DERIVATION_VERSION,
  PROFILE_SELECT,
  type DeriveRow,
} from "@/lib/rec/derive";

export { deriveProfile, PROFILE_SELECT };

/** Read a stored profile, deriving and caching it the first time it is asked for. */
export async function profileFor(filmId: string): Promise<Vector | null> {
  const stored = await db.filmProfile.findUnique({ where: { filmId } });
  if (stored) return JSON.parse(stored.dims) as Vector;

  const film = await db.film.findUnique({
    where: { id: filmId },
    select: PROFILE_SELECT,
  });
  if (!film) return null;

  const dims = deriveProfile(film);
  await db.filmProfile.upsert({
    where: { filmId },
    create: {
      filmId,
      dims: JSON.stringify(dims),
      source: "derived",
      confidence: 0.4,
      version: DERIVATION_VERSION,
    },
    update: { dims: JSON.stringify(dims), version: DERIVATION_VERSION },
  });
  return dims;
}

/**
 * Profiles for a batch of films, without a query per film.
 *
 * The ranker scores hundreds of candidates at a time, so anything shaped like
 * "await inside a loop" is the difference between a page and a timeout. Rows
 * with no stored profile are derived in memory and written back in one go.
 */
export async function profilesFor(
  films: (DeriveRow & { id: string })[],
): Promise<Map<string, Vector>> {
  const ids = films.map((film) => film.id);
  const stored = await db.filmProfile.findMany({
    where: { filmId: { in: ids } },
    select: { filmId: true, dims: true },
  });

  const out = new Map<string, Vector>(
    stored.map((row) => [row.filmId, JSON.parse(row.dims) as Vector]),
  );

  const missing = films.filter((film) => !out.has(film.id));
  for (const film of missing) out.set(film.id, deriveProfile(film));

  // Written back, but never in the request's way: a page should not wait on
  // a cache fill it does not read.
  if (missing.length > 0) {
    void db.filmProfile
      .createMany({
        data: missing.map((film) => ({
          filmId: film.id,
          dims: JSON.stringify(out.get(film.id)),
          source: "derived",
          confidence: 0.4,
          version: DERIVATION_VERSION,
        })),
      })
      .catch(() => {
        // A racing request wrote them first. Nothing to do and nothing lost.
      });
  }

  return out;
}
