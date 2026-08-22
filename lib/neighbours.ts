import "server-only";
import { db } from "@/lib/db";
import { AXES, averageAxis, type AxisKey } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";

/**
 * Taste neighbours — people whose viewing resembles yours.
 *
 * Explicitly NOT "rated the same films the same way". Two people can overlap
 * on forty titles and want completely different things from them, and two
 * people with almost no shared films can still be the same kind of viewer.
 * So the comparison runs over five independent facets and the score is their
 * weighted blend:
 *
 *   axes      what they reward — the strongest signal, and the only one that
 *             survives having seen nothing in common
 *   genres    what they reach for
 *   decades   when their cinema is
 *   countries where it comes from
 *   directors who they return to
 *
 * Distributions are compared with cosine similarity, which is scale-free —
 * somebody with 400 ratings and somebody with 12 can still read as the same
 * shape. Directors are compared with Jaccard, because that one really is
 * about the specific names.
 *
 * Facets nobody has data for are dropped and the weights renormalised over
 * what is left, so a thin profile is compared honestly on what it does have
 * rather than being scored down for silence.
 */

const WEIGHTS = { axes: 0.34, genres: 0.24, decades: 0.16, countries: 0.14, directors: 0.12 };

/** Below this there is not enough signal to claim a resemblance. */
const MIN_RATINGS = 3;

type Vec = Map<string, number>;

export type Neighbour = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  watched: number;
  /** 0–100. */
  overlap: number;
  /** The two facets they agree on most, in words. */
  because: string[];
};

type Profile = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  watched: number;
  axes: Map<AxisKey, number>;
  genres: Vec;
  decades: Vec;
  countries: Vec;
  directors: Set<string>;
};

function cosine(a: Vec, b: Vec): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const w = b.get(k);
    if (w) dot += v * w;
  }
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let shared = 0;
  for (const v of a) if (b.has(v)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Axis agreement. Compared as the SHAPE of the profile — each axis measured
 * against that person's own mean — so a generous marker and a harsh one who
 * reward the same things read as alike, which is the whole point. Raw scores
 * would mostly measure severity.
 */
function axisAffinity(a: Map<AxisKey, number>, b: Map<AxisKey, number>): number | null {
  const shared = AXES.map(({ key }) => key).filter((k) => a.has(k) && b.has(k));
  if (shared.length < 2) return null;

  const centre = (m: Map<AxisKey, number>) => {
    const vals = shared.map((k) => m.get(k)!);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return shared.map((k) => m.get(k)! - mean);
  };

  const va = centre(a);
  const vb = centre(b);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < shared.length; i++) {
    dot += va[i] * vb[i];
    na += va[i] * va[i];
    nb += vb[i] * vb[i];
  }
  // Both profiles perfectly flat: no disagreement, but no evidence either.
  if (na === 0 || nb === 0) return 0.5;
  // Correlation runs -1..1; map onto 0..1.
  return (dot / (Math.sqrt(na) * Math.sqrt(nb)) + 1) / 2;
}

function normalise(counts: Map<string, number>): Vec {
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return new Map();
  return new Map([...counts].map(([k, v]) => [k, v / total]));
}

const RATER = {
  username: true,
  displayName: true,
  bio: true,
  location: true,
  ratings: {
    select: {
      overall: true, story: true, direction: true, visual: true,
      performance: true, sound: true,
      film: {
        select: { year: true, genres: true, director: true, country: true, productionCountries: true },
      },
    },
  },
} as const;

type RaterRow = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  ratings: {
    overall: number;
    story: number | null; direction: number | null; visual: number | null;
    performance: number | null; sound: number | null;
    film: { year: number; genres: string; director: string; country: string | null; productionCountries: string | null };
  }[];
};

function profile(row: RaterRow): Profile | null {
  if (row.ratings.length < MIN_RATINGS) return null;

  const axes = new Map<AxisKey, number>();
  for (const { key } of AXES) {
    const mean = averageAxis(row.ratings, key);
    if (mean !== null) axes.set(key, mean);
  }

  const genres = new Map<string, number>();
  const decades = new Map<string, number>();
  const countries = new Map<string, number>();
  const directors = new Set<string>();

  for (const r of row.ratings) {
    for (const g of fromCsv(r.film.genres)) genres.set(g, (genres.get(g) ?? 0) + 1);
    const d = String(Math.floor(r.film.year / 10) * 10);
    decades.set(d, (decades.get(d) ?? 0) + 1);
    // Real production metadata when we have it; the region label is not
    // geography and would make everyone from "Europe" look alike.
    for (const c of fromCsv(r.film.productionCountries ?? "")) {
      countries.set(c, (countries.get(c) ?? 0) + 1);
    }
    if (r.film.director && r.film.director !== "Unknown") directors.add(r.film.director);
  }

  return {
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    location: row.location,
    watched: row.ratings.length,
    axes,
    genres: normalise(genres),
    decades: normalise(decades),
    countries: normalise(countries),
    directors,
  };
}

const FACET_WORDS: Record<keyof typeof WEIGHTS, string> = {
  axes: "reward the same things",
  genres: "reach for the same genres",
  decades: "watch the same decades",
  countries: "watch the same countries",
  directors: "return to the same directors",
};

export async function tasteNeighbours(
  username: string,
  take = 6,
): Promise<Neighbour[]> {
  const rows = (await db.user.findMany({
    where: { ratings: { some: {} } },
    select: RATER,
  })) as RaterRow[];

  const profiles = rows.map(profile).filter((p): p is Profile => !!p);
  const me = profiles.find((p) => p.username === username);
  if (!me) return [];

  return profiles
    .filter((p) => p.username !== username)
    .map((them) => {
      const facets: Partial<Record<keyof typeof WEIGHTS, number>> = {
        axes: axisAffinity(me.axes, them.axes) ?? undefined,
        genres: cosine(me.genres, them.genres) ?? undefined,
        decades: cosine(me.decades, them.decades) ?? undefined,
        countries: cosine(me.countries, them.countries) ?? undefined,
        directors: jaccard(me.directors, them.directors) ?? undefined,
      };

      // Renormalise over the facets that actually had data on both sides.
      const present = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter(
        (k) => typeof facets[k] === "number",
      );
      const mass = present.reduce((s, k) => s + WEIGHTS[k], 0);
      if (mass === 0) return null;

      const score = present.reduce((s, k) => s + WEIGHTS[k] * facets[k]!, 0) / mass;

      const because = present
        .filter((k) => facets[k]! >= 0.6)
        .sort((a, b) => facets[b]! - facets[a]!)
        .slice(0, 2)
        .map((k) => FACET_WORDS[k]);

      return {
        username: them.username,
        displayName: them.displayName,
        bio: them.bio,
        location: them.location,
        watched: them.watched,
        overlap: Math.round(score * 100),
        because,
      };
    })
    .filter((n): n is Neighbour => !!n)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, take);
}
