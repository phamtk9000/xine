/**
 * Where in the history of cinema somebody actually lives.
 *
 * Two numbers do the work. The centre of gravity is the mean release year of
 * what they watch, which answers "when is their cinema". The core range is
 * the middle half of it — the 25th to 75th percentile — which answers "how
 * wide". A plain min–max would be useless: one Murnau among forty new
 * releases would report a range of a century and describe nobody.
 *
 * Percentiles rather than mean ± standard deviation, because viewing years
 * are not remotely normal. They cluster hard at the present with a long tail
 * backwards, and a symmetric band drawn around that mean would put its lower
 * edge somewhere no film exists.
 *
 * Pure: no database, no `server-only`.
 */

export type Era = {
  /** Mean release year, rounded. */
  centre: number;
  /** The middle half of their viewing. */
  from: number;
  to: number;
  /** Full extent, for drawing the axis. */
  earliest: number;
  latest: number;
  /** One bar per year in [earliest, latest]. */
  spread: { year: number; count: number }[];
  total: number;
  /** True when the range is tight enough to be worth calling an era. */
  focused: boolean;
};

/** Nearest-rank percentile on a sorted array. */
function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[i];
}

export function readEra(years: number[]): Era | null {
  const clean = years.filter((y) => Number.isFinite(y) && y > 1880).sort((a, b) => a - b);
  if (clean.length < 3) return null;

  const earliest = clean[0];
  const latest = clean[clean.length - 1];
  const centre = Math.round(clean.reduce((s, y) => s + y, 0) / clean.length);

  const from = percentile(clean, 0.25);
  const to = percentile(clean, 0.75);

  const tally = new Map<number, number>();
  for (const y of clean) tally.set(y, (tally.get(y) ?? 0) + 1);
  const spread: { year: number; count: number }[] = [];
  for (let y = earliest; y <= latest; y++) {
    spread.push({ year: y, count: tally.get(y) ?? 0 });
  }

  return {
    centre,
    from,
    to,
    earliest,
    latest,
    spread,
    total: clean.length,
    // A band covering most of a century is not an era, it is a shrug.
    focused: to - from <= 30,
  };
}

/** The sentence under the timeline. */
export function describeEra(era: Era): string {
  if (era.from === era.to) {
    return `Almost everything you watch was made in ${era.from}.`;
  }
  if (!era.focused) {
    return `Your viewing runs from ${era.earliest} to ${era.latest} without settling anywhere — half of it falls between ${era.from} and ${era.to}, which is most of a century.`;
  }
  return `You return most often to films made between ${era.from} and ${era.to}.`;
}
