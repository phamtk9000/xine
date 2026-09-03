import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { clamp01, NEUTRAL, type Vector } from "@/lib/rec/dimensions";

/**
 * What a film is like, worked out from what we already know about it.
 *
 * Twelve thousand films cannot each cost an AI call, and most of them do not
 * need one: genre, runtime, year, country, popularity and a critic score
 * already say a great deal about pace, darkness, weight and familiarity. So
 * the first pass is arithmetic — cheap, instant, and reproducible — and it
 * writes `source: "derived"` on everything it touches so a better source can
 * overwrite it later without a conversation about precedence.
 *
 * These are deliberately blunt rules rather than a model. A Horror film is
 * dark; a Documentary is grounded; a 190-minute film from 1965 is patient.
 * None of that is subtle and all of it is true often enough to rank with,
 * which is the bar a first pass has to clear — not the bar it has to be
 * mistaken for a final answer.
 */

const DERIVATION_VERSION = 1;

/** What each genre says about the dimensions, as offsets from neutral. */
const GENRE_PULL: Record<string, Vector> = {
  Action: { pace: 0.3, tension: 0.2, violence: 0.25, story: 0.15, weight: -0.1 },
  Adventure: { pace: 0.15, realism: 0.15, darkness: -0.15, story: 0.1 },
  Animation: { realism: 0.3, darkness: -0.2, beauty: 0.15, accessibility: -0.15 },
  Comedy: { humour: 0.4, darkness: -0.25, weight: -0.2, accessibility: -0.15 },
  Crime: { darkness: 0.2, tension: 0.2, violence: 0.15, story: 0.15 },
  Documentary: { realism: -0.35, dialogue: 0.25, accessibility: 0.1, story: -0.1 },
  Drama: { weight: 0.2, story: -0.2, dialogue: 0.15 },
  Family: { darkness: -0.35, weight: -0.25, accessibility: -0.25, humour: 0.15 },
  Fantasy: { realism: 0.4, beauty: 0.15 },
  History: { weight: 0.2, dialogue: 0.15, pace: -0.15, realism: -0.15 },
  Horror: { darkness: 0.35, tension: 0.35, violence: 0.2, weight: 0.1 },
  Music: { humour: 0.1, weight: -0.1, beauty: 0.1 },
  Mystery: { tension: 0.25, story: 0.2, accessibility: 0.1 },
  Romance: { romance: 0.45, weight: 0.1, story: -0.15 },
  "Science Fiction": { realism: 0.35, weirdness: 0.15, story: 0.1 },
  Thriller: { tension: 0.35, pace: 0.2, darkness: 0.15, story: 0.15 },
  War: { weight: 0.3, violence: 0.3, darkness: 0.25 },
  Western: { pace: -0.1, violence: 0.2, beauty: 0.15 },
};

/**
 * Cinemas that skew a reading, and by how much.
 *
 * Not a claim about a country — a claim about which films from it reach a
 * catalogue like this one. What travels out of Japan, Iran or Sweden into an
 * English-language database is disproportionately the slow, serious end of
 * those cinemas, and pretending otherwise would leave every non-Hollywood
 * film sitting at exactly neutral.
 */
const COUNTRY_PULL: Record<string, Vector> = {
  JP: { pace: -0.1, beauty: 0.1, weirdness: 0.05 },
  KR: { tension: 0.15, darkness: 0.1, pace: 0.05 },
  IR: { pace: -0.2, realism: -0.2, accessibility: 0.15, beauty: 0.1 },
  SE: { pace: -0.15, darkness: 0.15, weight: 0.1 },
  DK: { pace: -0.1, darkness: 0.15, weight: 0.1 },
  FR: { dialogue: 0.15, pace: -0.1, accessibility: 0.1 },
  IT: { beauty: 0.1, weight: 0.1 },
  RU: { pace: -0.2, weight: 0.2, accessibility: 0.15 },
  SU: { pace: -0.2, weight: 0.2, accessibility: 0.15 },
  IN: { pace: 0.1, humour: 0.1, romance: 0.15 },
  US: { accessibility: -0.05, pace: 0.05 },
};

type Row = {
  genres: string;
  runtime: number | null;
  year: number;
  originCountry: string | null;
  tmdbVotes: number;
  tmdbScore: number | null;
  criticScore: number | null;
  reviewed: boolean;
};

/**
 * The arithmetic, in one place so it can be tested and re-run.
 *
 * Every rule starts from neutral and adds. Nothing multiplies, because a
 * product of six half-confident guesses is a number nobody can reason about.
 */
export function deriveProfile(film: Row): Vector {
  const dims: Record<string, number> = {};
  const add = (vector: Vector) => {
    for (const [key, offset] of Object.entries(vector)) {
      dims[key] = (dims[key] ?? NEUTRAL) + (offset ?? 0);
    }
  };

  for (const genre of fromCsv(film.genres)) {
    const pull = GENRE_PULL[genre];
    if (pull) add(pull);
  }

  const home = film.originCountry?.split(",")[0]?.trim();
  if (home && COUNTRY_PULL[home]) add(COUNTRY_PULL[home]);

  // Runtime is the most honest single signal about patience there is: a
  // 95-minute film has to move, a 165-minute one has decided not to.
  if (film.runtime) {
    if (film.runtime >= 150) add({ pace: -0.2, weight: 0.15, accessibility: 0.1 });
    else if (film.runtime >= 125) add({ pace: -0.1, weight: 0.05 });
    else if (film.runtime <= 95) add({ pace: 0.15, accessibility: -0.1 });
  }

  // Older films read as slower to a modern audience whatever they were at the
  // time, and pre-sound-era pacing conventions are genuinely different.
  if (film.year < 1970) add({ pace: -0.15, accessibility: 0.15, dialogue: 0.05 });
  else if (film.year < 1990) add({ pace: -0.05, accessibility: 0.05 });
  else if (film.year >= 2015) add({ pace: 0.05 });

  // Familiarity is the one dimension the catalogue knows exactly: a film with
  // four hundred votes is a hidden gem by any definition worth having.
  const votes = Math.max(1, film.tmdbVotes);
  const reach = Math.min(1, Math.log10(votes) / 4.3); // 20k votes ≈ 1
  dims.familiarity = clamp01(1 - reach);

  // A film rated well by few people is usually a demanding one; a film rated
  // well by everybody is usually not.
  const score = film.criticScore ?? film.tmdbScore ?? null;
  if (score !== null) {
    const quality = score / 10;
    add({ beauty: (quality - 0.6) * 0.5 });
    if (votes < 2000 && quality > 0.7) add({ accessibility: 0.15, weirdness: 0.1 });
  }

  // Films this site has written about are, by selection, the odder end.
  if (film.reviewed) add({ weirdness: 0.05, beauty: 0.05 });

  const out: Vector = {};
  for (const [key, value] of Object.entries(dims)) {
    out[key as keyof Vector] = clamp01(value);
  }
  return out;
}

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

export const PROFILE_SELECT = {
  genres: true,
  runtime: true,
  year: true,
  originCountry: true,
  tmdbVotes: true,
  tmdbScore: true,
  criticScore: true,
  reviewed: true,
} as const;

/**
 * Profiles for a batch of films, without a query per film.
 *
 * The ranker scores hundreds of candidates at a time, so anything shaped like
 * "await inside a loop" is the difference between a page and a timeout. Rows
 * with no stored profile are derived in memory and written back in one go.
 */
export async function profilesFor(
  films: (Row & { id: string })[],
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
