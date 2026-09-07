"use server";

import { db } from "@/lib/db";
import { deriveProfile, PROFILE_SELECT } from "@/lib/rec/derive";
import { DIMENSIONS, NEUTRAL, clamp01, type Vector } from "@/lib/rec/dimensions";
import { getCurrentUser } from "@/lib/session";

/**
 * The homepage's twenty-second version of what xine is for.
 *
 * Everything else on the front page explains the site — it is a magazine, a
 * catalogue, a rating system, a recommender, a workshop. All true, and none
 * of it answers the only question a first-time visitor actually has, which is
 * why they should hand over an email address. This answers it by doing the
 * thing rather than describing it: name five films, get a reading.
 *
 * It works signed out on purpose. Asking somebody to make an account to find
 * out whether the account is worth making is the exact inversion of a good
 * argument.
 */

export type PrimerFilm = {
  id: string;
  slug: string;
  title: string;
  year: number;
  posterUrl: string | null;
};

export type PrimerReading = {
  /** The strongest few dimensions, as sentences. */
  traits: { label: string; strength: number }[];
  /** Two films that follow from the picks, as evidence the reading works. */
  suggestions: { slug: string; title: string; year: number; posterUrl: string | null }[];
  saved: boolean;
};

/**
 * The shelf people choose from.
 *
 * Well-known films with art, because a primer that opens with titles nobody
 * recognises is a quiz rather than an invitation. Widened well past the five
 * being asked for so the grid does not feel like a fixed set.
 */
export async function primerShelf(take = 24): Promise<PrimerFilm[]> {
  const films = await db.film.findMany({
    where: { kind: "film", posterUrl: { not: null }, tmdbVotes: { gte: 4000 } },
    orderBy: { tmdbVotes: "desc" },
    take: take * 3,
    select: { id: true, slug: true, title: true, year: true, posterUrl: true, director: true },
  });

  // One per director, so the shelf is not four Nolans and three Tarantinos.
  const seen = new Set<string>();
  const out: PrimerFilm[] = [];
  for (const film of films) {
    if (seen.has(film.director)) continue;
    seen.add(film.director);
    out.push(film);
    if (out.length >= take) break;
  }
  return out;
}

/**
 * Read five picks as a taste.
 *
 * The average of what those films *are*, on the dimensions the recommender
 * already reasons in — not an invented score on axes nobody filled in. That
 * distinction matters: a reading assembled from numbers the reader never gave
 * is the kind of thing somebody catches once and then disbelieves everywhere
 * else on the site.
 *
 * When somebody is signed in, the picks are written as real ratings, because
 * a profile that evaporates on refresh is a demo rather than a feature.
 */
export async function readPrimer(filmIds: string[]): Promise<PrimerReading | null> {
  const ids = [...new Set(filmIds)].slice(0, 8);
  if (ids.length < 3) return null;

  const films = await db.film.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...PROFILE_SELECT },
  });
  if (films.length === 0) return null;

  const totals: Record<string, { sum: number; n: number }> = {};
  for (const film of films) {
    for (const [key, value] of Object.entries(deriveProfile(film))) {
      if (value === undefined) continue;
      const entry = (totals[key] ??= { sum: 0, n: 0 });
      entry.sum += value;
      entry.n += 1;
    }
  }

  const vector: Vector = {};
  for (const [key, entry] of Object.entries(totals)) {
    vector[key as keyof Vector] = clamp01(entry.sum / entry.n);
  }

  // Only the dimensions these films actually agree about. A trait list that
  // includes everything says nothing, and the middle of a scale is not a
  // preference.
  const traits = DIMENSIONS.map((dimension) => {
    const value = vector[dimension.key];
    if (value === undefined) return null;
    const distance = Math.abs(value - NEUTRAL);
    return {
      label: value >= NEUTRAL ? dimension.high : dimension.low,
      strength: distance * 2,
    };
  })
    .filter((row): row is NonNullable<typeof row> => row !== null && row.strength >= 0.2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);

  // Evidence: two films the picks point at. Neighbours of the picks rather
  // than a fresh recommendation, so the connection is visible.
  const neighbours = await db.filmNeighbour.findMany({
    where: { filmId: { in: ids }, neighbourId: { notIn: ids } },
    orderBy: { score: "desc" },
    take: 12,
    select: { neighbour: { select: { slug: true, title: true, year: true, posterUrl: true } } },
  });

  const suggestions = neighbours
    .map((row) => row.neighbour)
    .filter((film) => film.posterUrl)
    .slice(0, 2);

  // Signed in: keep it. The picks become ordinary ratings, exactly as the
  // onboarding flow writes them, so nothing downstream has to know they came
  // from the homepage.
  const user = await getCurrentUser();
  if (user) {
    await db.$transaction(
      ids.map((filmId) =>
        db.rating.upsert({
          where: { userId_filmId: { userId: user.id, filmId } },
          create: { userId: user.id, filmId, overall: 8.7 },
          update: {},
        }),
      ),
    );
  }

  return { traits, suggestions, saved: !!user };
}
