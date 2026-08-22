/**
 * Where in the history of cinema somebody actually lives.
 *
 * Two numbers, both chosen because the obvious alternative lies.
 *
 * THE ERA is the narrowest continuous run of years holding 70% of what they
 * watched — not earliest-to-latest, which one Murnau among forty new releases
 * would stretch to a century and which would then describe nobody. Framed as
 * "the smallest window that still contains most of you", it survives outliers
 * by construction rather than by trimming them away by hand.
 *
 * THE CENTRE OF GRAVITY is the weighted median, not the mean. Release years
 * pile up at the present with a long tail backwards, and a mean sitting in
 * that tail reports a year the person barely watches. The median is where
 * half their viewing falls on either side, which is what "centre" should mean.
 *
 * Everything is computed twice — over everything they watched, and over what
 * they rated highly — because those are different facts. What somebody puts
 * on is not what they love, and the gap between the two is the most
 * interesting thing this file produces.
 *
 * Pure: no database, no `server-only`.
 */

export type EraFilm = {
  year: number;
  title: string;
  slug: string;
  score: number;
};

export type YearCell = {
  year: number;
  count: number;
  mean: number | null;
  best: { title: string; slug: string; score: number } | null;
};

export type EraReading = {
  /** Narrowest span holding `COVERAGE` of the viewing. */
  from: number;
  to: number;
  /** Weighted median release year. */
  centre: number;
  earliest: EraFilm;
  latest: EraFilm;
  /** One cell per year across the whole axis, zeros included. */
  years: YearCell[];
  /** Decade-rounded axis bounds, so the end labels are round numbers. */
  axisFrom: number;
  axisTo: number;
  total: number;
  /** Tallest column, for scaling. */
  peak: number;
};

/** Share of viewing the era has to contain. */
const COVERAGE = 0.7;
/** Below this there is no distribution to describe. */
const MIN_FILMS = 3;

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Smallest window containing at least `COVERAGE` of the films.
 *
 * Sorted years and a fixed-width sliding window: any span holding k films is
 * bounded by two of them, so checking every k-length run of the sorted list
 * finds the tightest without searching year pairs.
 */
function tightestSpan(sorted: number[]) {
  const need = Math.max(1, Math.ceil(sorted.length * COVERAGE));
  let best: [number, number] = [sorted[0], sorted[sorted.length - 1]];
  let width = Infinity;
  for (let i = 0; i + need - 1 < sorted.length; i++) {
    const j = i + need - 1;
    const w = sorted[j] - sorted[i];
    if (w < width) {
      width = w;
      best = [sorted[i], sorted[j]];
    }
  }
  return best;
}

export function readEra(films: EraFilm[]): EraReading | null {
  const clean = films
    .filter((f) => Number.isFinite(f.year) && f.year > 1880)
    .sort((a, b) => a.year - b.year);
  if (clean.length < MIN_FILMS) return null;

  const years = clean.map((f) => f.year);
  const [from, to] = tightestSpan(years);
  const centre = median(years);

  const axisFrom = Math.floor(years[0] / 10) * 10;
  const axisTo = Math.ceil((years[years.length - 1] + 1) / 10) * 10;

  const byYear = new Map<number, EraFilm[]>();
  for (const f of clean) {
    const list = byYear.get(f.year) ?? [];
    list.push(f);
    byYear.set(f.year, list);
  }

  const cells: YearCell[] = [];
  for (let y = axisFrom; y <= axisTo; y++) {
    const list = byYear.get(y) ?? [];
    const best = list.reduce<EraFilm | null>(
      (b, f) => (!b || f.score > b.score ? f : b),
      null,
    );
    cells.push({
      year: y,
      count: list.length,
      mean: list.length
        ? Math.round((list.reduce((s, f) => s + f.score, 0) / list.length) * 10) / 10
        : null,
      best: best ? { title: best.title, slug: best.slug, score: best.score } : null,
    });
  }

  return {
    from,
    to,
    centre,
    earliest: clean[0],
    latest: clean[clean.length - 1],
    years: cells,
    axisFrom,
    axisTo,
    total: clean.length,
    peak: Math.max(...cells.map((c) => c.count), 1),
  };
}

export type EraPair = {
  watched: EraReading;
  /** Null when they haven't rated enough highly to have a taste era. */
  loved: EraReading | null;
  observation: string;
};

/** The bar above which a film counts as loved. */
export const LOVED_AT = 8;

export function readEraPair(films: EraFilm[]): EraPair | null {
  const watched = readEra(films);
  if (!watched) return null;
  const loved = readEra(films.filter((f) => f.score >= LOVED_AT));
  return { watched, loved, observation: observe(watched, loved, films) };
}

const DECADE_WORDS: Record<number, string> = {
  1920: "twenties", 1930: "thirties", 1940: "forties", 1950: "fifties",
  1960: "sixties", 1970: "seventies", 1980: "eighties", 1990: "nineties",
};

/**
 * One sentence, in the house voice.
 *
 * Rule-based and ordered by how much the finding actually tells you, so the
 * most unusual true thing wins. It is a remark, not a summary — the numbers
 * are already on the page directly above it, and repeating them in prose is
 * what makes a page feel like a dashboard describing itself.
 */
function observe(
  watched: EraReading,
  loved: EraReading | null,
  films: EraFilm[],
): string {
  // The gap between what they put on and what they rate highly.
  if (loved && loved.total >= 4) {
    const drift = watched.centre - loved.centre;
    if (drift >= 8) {
      return `You watch contemporary cinema, but the films you rate highest sit a decade earlier — your taste is older than your viewing.`;
    }
    if (drift <= -8) {
      return `You watch backwards and rate forwards: your favourites are consistently newer than the bulk of what you put on.`;
    }
  }

  const recent = films.filter((f) => f.year >= 2015).length / films.length;
  const lovedRecent = loved
    ? loved.years.filter((c) => c.year >= 2015).reduce((s, c) => s + c.count, 0) /
      Math.max(1, loved.total)
    : 0;
  if (loved && loved.total >= 4 && lovedRecent >= 0.6) {
    return `Your taste is unusually contemporary: ${Math.round(lovedRecent * 100)}% of your highest-rated films were released after 2015.`;
  }

  const openDecade = Math.floor(watched.earliest.year / 10) * 10;
  const word = DECADE_WORDS[openDecade];
  if (word && watched.centre >= 2000) {
    return `Your cinema begins in the ${word}, but its gravitational pull is distinctly twenty-first century.`;
  }

  if (watched.to - watched.from >= 40) {
    return `You watch across the whole history of the medium rather than settling in one part of it.`;
  }

  if (recent >= 0.7) {
    return `You watch almost entirely in the present tense — the past is somewhere you visit rather than live.`;
  }

  return `Your viewing gathers tightly around ${watched.centre}, with little pull from either side of it.`;
}
