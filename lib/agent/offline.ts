import "server-only";
import { db } from "@/lib/db";
import { AXES, averageAxis, averageOverall, round1 } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";

/**
 * The recommender that costs nothing.
 *
 * No model, no API key, no per-search bill. It reads the request for signals
 * it can match against structured data — the five axes, genre, country, era,
 * runtime — scores every candidate, and picks three at different distances
 * from what was asked.
 *
 * It cannot reason about a reference film or write a critic's sentence, and it
 * does not pretend to: every rationale it produces is assembled from facts in
 * the row rather than generated. That honesty is the point. A recommendation
 * built from "rated 9.5 on Visual, the highest in the catalogue" is worth more
 * than fluent prose with nothing behind it.
 */

export type Signal = {
  axes: Partial<Record<string, number>>;
  genres: string[];
  countries: string[];
  maxRuntime: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  excludeGenres: string[];
};

/** Words that point at a rating axis. */
const AXIS_WORDS: Record<string, string[]> = {
  visual: ["look", "looks", "looking", "visual", "beautiful", "gorgeous", "cinematography", "shot", "images", "painterly", "stunning", "stare"],
  sound: ["sound", "score", "music", "soundtrack", "audio", "sonic", "muted", "silence"],
  story: ["story", "plot", "script", "writing", "narrative", "twist", "written"],
  performance: ["performance", "acting", "actor", "actress", "cast", "gutted", "devastating", "moving", "heartbreaking"],
  direction: ["direction", "directed", "director", "craft", "control", "staging"],
};

const MOOD_GENRES: Record<string, string[]> = {
  scary: ["Horror"], scared: ["Horror"], unnerved: ["Horror", "Thriller"],
  dread: ["Horror", "Thriller"], creepy: ["Horror"],
  funny: ["Comedy"], laugh: ["Comedy"], comedy: ["Comedy"],
  sad: ["Drama"], cry: ["Drama"], gutted: ["Drama"],
  tense: ["Thriller"], thriller: ["Thriller"], mystery: ["Mystery"],
  crime: ["Crime"], gangster: ["Crime"], noir: ["Crime", "Thriller"],
  romance: ["Romance"], love: ["Romance"],
  war: ["War"], history: ["History"], historical: ["History"],
  scifi: ["Science Fiction"], space: ["Science Fiction"],
  animated: ["Animation"], anime: ["Animation"],
  documentary: ["Documentary"], western: ["Western"],
};

const COUNTRY_WORDS: Record<string, string> = {
  vietnam: "Vietnam", vietnamese: "Vietnam",
  korea: "South Korea", korean: "South Korea",
  europe: "Europe", european: "Europe",
  american: "United States", america: "United States", hollywood: "United States",
  japan: "Japan", japanese: "Japan",
};

/** Pull structured signals out of plain language. Deterministic, no model. */
export function extractSignals(text: string): Signal {
  const lower = text.toLowerCase();
  const words = new Set(lower.split(/[^a-z0-9]+/).filter(Boolean));

  const axes: Partial<Record<string, number>> = {};
  for (const [axis, triggers] of Object.entries(AXIS_WORDS)) {
    const hits = triggers.filter((w) => words.has(w)).length;
    if (hits > 0) axes[axis] = hits;
  }

  const genres = new Set<string>();
  for (const [word, list] of Object.entries(MOOD_GENRES)) {
    if (words.has(word)) list.forEach((g) => genres.add(g));
  }

  const countries = new Set<string>();
  for (const [word, country] of Object.entries(COUNTRY_WORDS)) {
    if (words.has(word)) countries.add(country);
  }

  // "under 100 minutes", "under two hours", "90 min"
  let maxRuntime: number | null = null;
  const mins = lower.match(/under (\d{2,3})\s*(?:min|minute)/);
  if (mins) maxRuntime = Number(mins[1]);
  else if (/under (two|2) hours?/.test(lower)) maxRuntime = 120;
  else if (/under (three|3) hours?/.test(lower)) maxRuntime = 180;
  else if (/\bshort\b/.test(lower)) maxRuntime = 105;

  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  if (/before 2000|classic|old\b/.test(lower)) yearTo = 1999;
  if (/recent|last five years|new\b|modern/.test(lower)) yearFrom = 2021;
  const decade = lower.match(/\b(19|20)(\d)0s\b/);
  if (decade) {
    const start = Number(`${decade[1]}${decade[2]}0`);
    yearFrom = start;
    yearTo = start + 9;
  }

  const excludeGenres: string[] = [];
  if (/not (scary|horror)|no horror/.test(lower)) excludeGenres.push("Horror");
  if (/not sad|nothing depressing|less depressing/.test(lower)) excludeGenres.push("Drama");

  return {
    axes,
    genres: [...genres],
    countries: [...countries],
    maxRuntime,
    yearFrom,
    yearTo,
    excludeGenres,
  };
}

export type ScoredFilm = {
  slug: string;
  title: string;
  year: number;
  director: string;
  country: string | null;
  runtime: number | null;
  genres: string[];
  posterUrl: string | null;
  reviewed: boolean;
  criticScore: number | null;
  communityScore: number | null;
  tmdbScore: number | null;
  tmdbVotes: number;
  axes: Record<string, number | null>;
  score: number;
  reasons: string[];
};

/**
 * Weighted scoring. The proportions matter more than the absolute numbers:
 * how well it matches what was asked outranks how good it is, because "good"
 * is what a popularity list already optimises for.
 */
export async function recommendOffline(request: string, limit = 3) {
  const signal = extractSignals(request);

  const films = await db.film.findMany({
    where: {
      ...(signal.maxRuntime ? { runtime: { lte: signal.maxRuntime, not: null } } : {}),
      ...(signal.yearFrom || signal.yearTo
        ? {
            year: {
              ...(signal.yearFrom ? { gte: signal.yearFrom } : {}),
              ...(signal.yearTo ? { lte: signal.yearTo } : {}),
            },
          }
        : {}),
      ...(signal.countries.length ? { country: { in: signal.countries } } : {}),
      ...(signal.genres.length
        ? { OR: signal.genres.map((g) => ({ genres: { contains: g } })) }
        : {}),
    },
    include: { ratings: true },
    take: 400,
  });

  const scored: ScoredFilm[] = [];

  for (const film of films) {
    const genres = fromCsv(film.genres);
    if (signal.excludeGenres.some((g) => genres.includes(g))) continue;

    const axes: Record<string, number | null> = {};
    for (const { key } of AXES) axes[key] = averageAxis(film.ratings, key);

    const community = averageOverall(film.ratings);
    const reasons: string[] = [];
    let score = 0;

    // Axis match — the thing only xine can do. Weighted highest.
    for (const [axis, weight] of Object.entries(signal.axes)) {
      const value = axes[axis];
      if (typeof value === "number") {
        score += (value / 10) * 40 * (weight ?? 1);
        const label = AXES.find((a) => a.key === axis)?.label ?? axis;
        reasons.push(`${label} ${value.toFixed(1)} from the xine community`);
      }
    }

    // Genre match.
    const genreHits = signal.genres.filter((g) => genres.includes(g));
    if (genreHits.length) {
      score += genreHits.length * 12;
      reasons.push(genreHits.join(" and "));
    }

    if (signal.countries.length && film.country) {
      score += 10;
      reasons.push(film.country);
    }
    if (signal.maxRuntime && film.runtime) {
      score += 8;
      reasons.push(`${film.runtime} minutes`);
    }

    // Quality, deliberately a smaller weight than fit.
    const quality = community ?? film.criticScore ?? film.tmdbScore ?? 0;
    score += quality * 2.2;

    // A reviewed film is worth surfacing — it has writing behind it.
    if (film.reviewed) {
      score += 6;
      reasons.push("reviewed by xine");
    }

    scored.push({
      slug: film.slug,
      title: film.title,
      year: film.year,
      director: film.director,
      country: film.country,
      runtime: film.runtime,
      genres,
      posterUrl: film.posterUrl,
      reviewed: film.reviewed,
      criticScore: film.criticScore,
      communityScore: community,
      tmdbScore: film.tmdbScore,
      tmdbVotes: film.tmdbVotes,
      axes,
      score: round1(score),
      reasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];

  // Three at different distances, rather than three near-identical bests.
  const safe = scored[0];
  const adjacent =
    scored.slice(1, 40).find(
      (f) => !f.genres.some((g) => safe.genres.includes(g)) || f.country !== safe.country,
    ) ?? scored[1];

  // Wildcard: strong but under-seen. Low TMDB vote count is the proxy for
  // "you probably have not been shown this", which is what breaks a bubble.
  const wildcard =
    scored
      .slice(0, 80)
      .filter((f) => f.slug !== safe.slug && f.slug !== adjacent?.slug)
      .sort((a, b) => {
        const obscurity = (f: ScoredFilm) => (f.tmdbVotes ? 1 / Math.log10(f.tmdbVotes + 10) : 1);
        return b.score * obscurity(b) - a.score * obscurity(a);
      })[0] ?? scored[2];

  return [safe, adjacent, wildcard]
    .filter((f, i, all): f is ScoredFilm => Boolean(f) && all.indexOf(f) === i)
    .slice(0, limit);
}
