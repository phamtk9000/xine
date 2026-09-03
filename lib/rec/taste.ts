import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { deriveProfile, PROFILE_SELECT } from "@/lib/rec/profile";
import { clamp01, DIMENSION_KEYS, NEUTRAL, type Vector } from "@/lib/rec/dimensions";
import type { TasteInput } from "@/lib/rec/rank";

/**
 * The stable half of somebody's taste, and how it moves.
 *
 * Built from what they have rated highly, expressed on the same dimensions as
 * a film so the two can be compared directly. Ratings are the only strong
 * input: a thumb on a suggestion says something about a film nobody has seen,
 * and belongs to the evening rather than to the person.
 *
 * Three rules keep it honest.
 *
 * It is never overwritten by one signal. Updates are bounded exponential
 * moves — a rating shifts a dimension by a few percent of the distance, not
 * to the new value — so an unusual Tuesday cannot rewrite a year of watching.
 *
 * It carries how sure it is. A preference resting on four ratings and one
 * resting on four hundred must not argue with equal force, and a reader
 * inspecting their own profile deserves to see which parts are guesses.
 *
 * It is derived, not declared. Nothing here is stored that could not be
 * rebuilt from the ratings table, which means a bug in this file is a bad
 * afternoon rather than a corrupted account.
 */

/** Ratings this high are a preference; below the floor they are evidence against. */
const LOVED = 7.5;
const DISLIKED = 5.5;

/** How fast a single signal is allowed to move a dimension. */
export const LEARNING_RATE = {
  rating: 0.12,
  interested: 0.03,
  save: 0.05,
  never: 0.1,
} as const;

export type StoredTaste = {
  dims: Record<string, { value: number; confidence: number; samples: number }>;
  affinities: {
    directors: Record<string, number>;
    countries: Record<string, number>;
    genres: Record<string, number>;
  };
};

const EMPTY: StoredTaste = {
  dims: {},
  affinities: { directors: {}, countries: {}, genres: {} },
};

/**
 * Rebuild a reader's taste from their ratings.
 *
 * Run rather than incremented, because the input is small — nobody has rated
 * ten thousand films — and a rebuild cannot drift out of step with the table
 * it claims to summarise. The incremental path exists for the fast case; this
 * is the one that is definitionally correct.
 */
export async function rebuildTaste(userId: string): Promise<StoredTaste> {
  const ratings = await db.rating.findMany({
    where: { userId },
    select: {
      overall: true,
      film: {
        select: {
          id: true,
          director: true,
          country: true,
          ...PROFILE_SELECT,
        },
      },
    },
  });

  const sums: Record<string, { total: number; weight: number }> = {};
  const directors: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const genres: Record<string, number> = {};

  for (const rating of ratings) {
    // Loved films pull toward their profile; disliked ones push away from it.
    const pull =
      rating.overall >= LOVED
        ? rating.overall / 10
        : rating.overall <= DISLIKED
          ? -0.5
          : 0;
    if (pull === 0) continue;

    const profile = deriveProfile(rating.film);

    for (const key of DIMENSION_KEYS) {
      const value = profile[key];
      if (value === undefined) continue;
      const entry = (sums[key] ??= { total: 0, weight: 0 });
      // A dislike is evidence for the opposite end of the dimension.
      entry.total += (pull > 0 ? value : 1 - value) * Math.abs(pull);
      entry.weight += Math.abs(pull);
    }

    if (pull > 0) {
      if (rating.film.director && rating.film.director !== "Unknown") {
        directors[rating.film.director] =
          (directors[rating.film.director] ?? 0) + pull;
      }
      if (rating.film.country) {
        countries[rating.film.country] = (countries[rating.film.country] ?? 0) + pull;
      }
      for (const genre of fromCsv(rating.film.genres)) {
        genres[genre] = (genres[genre] ?? 0) + pull;
      }
    }
  }

  const dims: StoredTaste["dims"] = {};
  for (const [key, entry] of Object.entries(sums)) {
    if (entry.weight === 0) continue;
    dims[key] = {
      value: clamp01(entry.total / entry.weight),
      // Confidence saturates slowly: ten ratings is a hint, fifty is a view.
      confidence: Math.min(0.95, 1 - Math.exp(-entry.weight / 6)),
      samples: Math.round(entry.weight * 10) / 10,
    };
  }

  const taste: StoredTaste = {
    dims,
    affinities: {
      directors: normalise(directors),
      countries: normalise(countries),
      genres: normalise(genres),
    },
  };

  await db.tasteVector.upsert({
    where: { userId },
    create: {
      userId,
      dims: JSON.stringify(taste.dims),
      affinities: JSON.stringify(taste.affinities),
    },
    update: {
      dims: JSON.stringify(taste.dims),
      affinities: JSON.stringify(taste.affinities),
    },
  });

  return taste;
}

/** Scale a tally to 0–1 so one prolific director cannot outweigh a dimension. */
function normalise(tally: Record<string, number>) {
  const peak = Math.max(1, ...Object.values(tally));
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(tally)) out[key] = value / peak;
  return out;
}

/** The stored profile, rebuilt if it has never been built. */
export async function tasteFor(userId: string): Promise<TasteInput> {
  const stored = await db.tasteVector.findUnique({ where: { userId } });
  const taste: StoredTaste = stored
    ? {
        dims: JSON.parse(stored.dims),
        affinities: JSON.parse(stored.affinities),
      }
    : await rebuildTaste(userId);

  return toInput(taste);
}

export function toInput(taste: StoredTaste): TasteInput {
  const dims: Vector = {};
  for (const [key, entry] of Object.entries(taste.dims ?? {})) {
    // A low-confidence dimension is pulled back toward neutral rather than
    // dropped: it should whisper, not shout, and not vanish.
    const pulled = NEUTRAL + (entry.value - NEUTRAL) * entry.confidence;
    dims[key as keyof Vector] = clamp01(pulled);
  }

  return {
    dims,
    directors: new Map(Object.entries(taste.affinities?.directors ?? {})),
    countries: new Map(Object.entries(taste.affinities?.countries ?? {})),
    genres: new Map(Object.entries(taste.affinities?.genres ?? {})),
  };
}

export const EMPTY_TASTE_PROFILE = EMPTY;
