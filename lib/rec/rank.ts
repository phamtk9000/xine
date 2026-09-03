import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { profilesFor, PROFILE_SELECT } from "@/lib/rec/profile";
import { similarity, NEUTRAL, type Vector } from "@/lib/rec/dimensions";
import {
  QUALITY_PRIOR,
  REPEAT_PENALTY,
  WEIGHTS,
  type RankingWeights,
} from "@/lib/rec/weights";
import type { Intent } from "@/lib/rec/intent";

/**
 * The ranker.
 *
 * Deterministic arithmetic, on purpose and permanently. No language model
 * runs inside this function and none ever should: ranking happens on every
 * press, has to answer in milliseconds, has to give the same answer twice for
 * the same inputs, and has to be explainable afterwards from stored numbers.
 * The AI's job is upstream — turning a sentence into an intent — and
 * downstream, turning the numbers below into a sentence.
 *
 * Four stages, in the only order that is affordable: filter on facts, score
 * what survives, penalise repetition, then take the top. Filtering first is
 * not an optimisation, it is the difference between scoring four hundred
 * candidates and scoring twelve thousand.
 */

export type Candidate = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  runtime: number | null;
  country: string | null;
  genres: string[];
  synopsis: string;
  posterUrl: string | null;
  criticScore: number | null;
  tmdbScore: number | null;
  tmdbVotes: number;
  reviewed: boolean;
};

/** What the score was made of, kept for the explanation and the debugger. */
export type Contributions = {
  session: number;
  taste: number;
  quality: number;
  novelty: number;
  editorial: number;
  serendipity: number;
  reference: number;
  repetition: number;
};

export type Ranked = Candidate & {
  score: number;
  contributions: Contributions;
  profile: Vector;
};

export type TasteInput = {
  dims: Vector;
  directors: Map<string, number>;
  countries: Map<string, number>;
  genres: Map<string, number>;
};

export const EMPTY_TASTE: TasteInput = {
  dims: {},
  directors: new Map(),
  countries: new Map(),
  genres: new Map(),
};

const SCAN = 500;

/**
 * Everything a film has to be before it is worth scoring.
 *
 * Facts only. A constraint that belongs here and is implemented as a
 * preference produces a page that ignores what it was told; a preference that
 * ends up here throws away good answers for a reason nobody stated.
 */
function where(intent: Intent, exclude: string[]) {
  const { hard } = intent;
  const clauses: Record<string, unknown>[] = [];

  if (hard.countries?.length) {
    clauses.push({
      OR: hard.countries.map((code) => ({
        originCountry: { startsWith: code },
      })),
    });
  }
  if (hard.includeGenres?.length) {
    clauses.push({
      OR: hard.includeGenres.map((genre) => ({ genres: { contains: genre } })),
    });
  }

  return {
    kind: "film",
    posterUrl: { not: null },
    ...(hard.runtimeMin || hard.runtimeMax
      ? {
          runtime: {
            ...(hard.runtimeMin ? { gte: hard.runtimeMin } : {}),
            ...(hard.runtimeMax ? { lte: hard.runtimeMax } : {}),
          },
        }
      : {}),
    ...(hard.yearMin || hard.yearMax
      ? {
          year: {
            ...(hard.yearMin ? { gte: hard.yearMin } : {}),
            ...(hard.yearMax ? { lte: hard.yearMax } : {}),
          },
        }
      : {}),
    ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}),
    ...(hard.excludeGenres?.length
      ? { AND: hard.excludeGenres.map((genre) => ({ NOT: { genres: { contains: genre } } })) }
      : {}),
    ...(clauses.length > 0 ? { AND: clauses } : {}),
  };
}

const SELECT = {
  id: true,
  slug: true,
  title: true,
  year: true,
  director: true,
  runtime: true,
  country: true,
  genres: true,
  synopsis: true,
  posterUrl: true,
  criticScore: true,
  tmdbScore: true,
  tmdbVotes: true,
  reviewed: true,
  originCountry: true,
} as const;

/**
 * The candidate pool, drawn twice.
 *
 * Once by reach and once by rating, because either ordering alone produces a
 * recognisable failure: reach gives a deck of blockbusters, rating gives a
 * deck of obscurities with four hundred votes. Taking both and letting the
 * scorer choose is cheaper than trying to express the compromise in SQL.
 */
export async function candidates(
  intent: Intent,
  exclude: string[],
): Promise<Candidate[]> {
  const filter = where(intent, exclude);

  const [byReach, byRating] = await Promise.all([
    db.film.findMany({
      where: filter,
      orderBy: { tmdbVotes: "desc" },
      take: SCAN,
      select: SELECT,
    }),
    db.film.findMany({
      where: { ...filter, tmdbVotes: { gte: 60 } },
      orderBy: [{ criticScore: "desc" }, { tmdbScore: "desc" }],
      take: Math.floor(SCAN / 2),
      select: SELECT,
    }),
  ]);

  const seen = new Set<string>();
  const pool: Candidate[] = [];
  for (const row of [...byReach, ...byRating]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    pool.push({ ...row, genres: fromCsv(row.genres) });
  }
  return pool;
}

/** Rated well, by enough people to mean it. */
function quality(film: Candidate) {
  const score = film.criticScore ?? film.tmdbScore ?? QUALITY_PRIOR.mean;
  const votes = film.criticScore !== null ? 5000 : film.tmdbVotes;
  const bayesian =
    (score * votes + QUALITY_PRIOR.mean * QUALITY_PRIOR.votes) /
    (votes + QUALITY_PRIOR.votes);
  return Math.min(1, Math.max(0, (bayesian - 4) / 5));
}

/**
 * How far this is from what they usually watch, spent deliberately.
 *
 * Serendipity is not randomness. A wildcard has to share one strong dimension
 * with the request — otherwise it is not a surprise, it is a mistake — and be
 * unlike the taste profile on the rest. That is the only kind of distance
 * worth offering somebody.
 */
function serendipity(intent: Intent, taste: TasteInput, profile: Vector) {
  const wanted = similarity(intent.soft, profile);
  const familiar = Object.keys(taste.dims).length > 0
    ? similarity(taste.dims, profile)
    : 0.5;
  return Math.max(0, wanted - familiar) * intent.exploration * 2;
}

export function rank(
  pool: Candidate[],
  profiles: Map<string, Vector>,
  intent: Intent,
  taste: TasteInput,
  options: {
    shown?: string[];
    take?: number;
    near?: Map<string, number>;
    /** The variant this session ranks with — see weightsFor. */
    weights?: RankingWeights;
  } = {},
): Ranked[] {
  const take = options.take ?? 30;
  const W = options.weights ?? WEIGHTS;
  const shownDirectors = new Map<string, number>();
  const shownCountries = new Map<string, number>();
  const shownGenres = new Map<string, number>();

  const scored = pool.map((film) => {
    const profile = profiles.get(film.id) ?? {};

    const session = similarity(intent.soft, profile);
    const tasteFit =
      Object.keys(taste.dims).length > 0 ? similarity(taste.dims, profile) : 0.5;

    // Affinities are names rather than dimensions, and they are worth having
    // separately: "you rate Bong Joon-ho highly" is a better reason than any
    // vector distance, and a reader recognises it as true.
    const director = taste.directors.get(film.director) ?? 0;
    const home = film.country ?? "";
    const country = taste.countries.get(home) ?? 0;
    const genreFit =
      film.genres.reduce((sum, genre) => sum + (taste.genres.get(genre) ?? 0), 0) /
      Math.max(1, film.genres.length);

    const named = Math.min(1, director * 0.6 + country * 0.2 + genreFit * 0.4);

    const contributions: Contributions = {
      session: session * W.session,
      taste: (tasteFit * 0.5 + named * 0.5) * W.taste,
      quality: quality(film) * W.quality,
      // Unfamiliar is good; already-shown is not. The profile's familiarity
      // dimension is the film's obscurity, which is exactly novelty.
      novelty: (profile.familiarity ?? NEUTRAL) * W.novelty,
      editorial: (film.reviewed ? 1 : 0) * W.editorial,
      serendipity: serendipity(intent, taste, profile) * W.serendipity,
      // Precomputed similarity to whatever film the reader named, if any.
      reference: (options.near?.get(film.id) ?? 0) * W.reference,
      repetition: 0,
    };

    const score =
      contributions.session +
      contributions.taste +
      contributions.quality +
      contributions.novelty +
      contributions.editorial +
      contributions.serendipity +
      contributions.reference;

    return { ...film, score, contributions, profile } as Ranked;
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity, applied greedily down the ranked list rather than as a second
  // sort: each pick makes the next film like it slightly less welcome. Two
  // Korean thrillers in a row is a coincidence; five is the site failing to
  // notice it has one idea.
  const out: Ranked[] = [];
  for (const film of scored) {
    if (out.length >= take) break;

    const decade = Math.floor(film.year / 10) * 10;
    const penalty =
      (shownDirectors.get(film.director) ?? 0) * REPEAT_PENALTY.director +
      (shownCountries.get(film.country ?? "") ?? 0) * REPEAT_PENALTY.country +
      film.genres.reduce(
        (sum, genre) => sum + (shownGenres.get(genre) ?? 0) * REPEAT_PENALTY.genre,
        0,
      ) /
        Math.max(1, film.genres.length) +
      (shownGenres.get(`decade:${decade}`) ?? 0) * REPEAT_PENALTY.decade;

    film.contributions.repetition = -penalty * W.repetition;
    film.score = Math.max(0, film.score + film.contributions.repetition);

    out.push(film);

    shownDirectors.set(film.director, (shownDirectors.get(film.director) ?? 0) + 1);
    shownCountries.set(home(film), (shownCountries.get(home(film)) ?? 0) + 1);
    for (const genre of film.genres) {
      shownGenres.set(genre, (shownGenres.get(genre) ?? 0) + 1);
    }
    shownGenres.set(`decade:${decade}`, (shownGenres.get(`decade:${decade}`) ?? 0) + 1);
  }

  // One more sort, because the penalties were applied after the first.
  return out.sort((a, b) => b.score - a.score);
}

function home(film: Candidate) {
  return film.country ?? "";
}

/**
 * How sure the ranking is of itself.
 *
 * Two things make a deck trustworthy: the reader said enough for the intent
 * to mean something, and the top of the list is clearly ahead of the middle.
 * When both are weak the honest move is to ask one question rather than deal
 * twenty cards nobody wants.
 */
export function confidenceOf(ranked: Ranked[], intent: Intent) {
  if (ranked.length === 0) return 0;
  const top = ranked[0].score;
  const median = ranked[Math.floor(ranked.length / 2)]?.score ?? 0;
  const separation = top > 0 ? Math.min(1, (top - median) / top) : 0;
  return Math.min(1, intent.confidence * 0.6 + separation * 0.4);
}

/** Films already dealt with, in one query — the hard filter's exclusion list. */
export async function judgedBy(userId: string): Promise<string[]> {
  const [ratings, logs, watchlist, feedback] = await Promise.all([
    db.rating.findMany({ where: { userId }, select: { filmId: true } }),
    db.filmLog.findMany({ where: { userId }, select: { filmId: true } }),
    db.watchlistItem.findMany({ where: { userId }, select: { filmId: true } }),
    db.filmFeedback.findMany({ where: { userId }, select: { filmId: true } }),
  ]);
  return [...new Set([...ratings, ...logs, ...watchlist, ...feedback].map((r) => r.filmId))];
}

/** The pool and its profiles, ready to rank. */
export async function poolFor(intent: Intent, exclude: string[]) {
  const pool = await candidates(intent, exclude);
  const profiles = await profilesFor(
    pool.map((film) => ({
      id: film.id,
      genres: film.genres.join(", "),
      runtime: film.runtime,
      year: film.year,
      originCountry: film.country,
      tmdbVotes: film.tmdbVotes,
      tmdbScore: film.tmdbScore,
      criticScore: film.criticScore,
      reviewed: film.reviewed,
    })),
  );
  return { pool, profiles };
}

export { PROFILE_SELECT };
