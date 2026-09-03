/**
 * The dimensions XINE reasons about, and nothing else.
 *
 * One list, used three ways: a film's semantic profile, a reader's long-term
 * taste, and tonight's intent are all vectors over exactly these keys. That
 * is the whole reason the ranker can compare them at all — three vocabularies
 * would need three translations, and translations are where meaning goes to
 * die.
 *
 * Everything is 0–1 with the high end named, because a signed scale invites
 * arguments about what zero means. `pace: 0` is meditative, `pace: 1` is
 * relentless, and a film with no opinion sits at 0.5 rather than at nothing.
 *
 * Client-safe on purpose: the chips, the sliders and the "why this" panel all
 * need these labels, and they cannot import anything that touches a database.
 */

export const DIMENSIONS = [
  { key: "pace", low: "Meditative", high: "Relentless" },
  { key: "weight", low: "Light", high: "Devastating" },
  { key: "accessibility", low: "Easy", high: "Challenging" },
  { key: "realism", low: "Grounded", high: "Fantastical" },
  { key: "dialogue", low: "Visual", high: "Talkative" },
  { key: "story", low: "Character-led", high: "Plot-driven" },
  { key: "darkness", low: "Comforting", high: "Bleak" },
  { key: "familiarity", low: "Popular", high: "Hidden gem" },
  { key: "weirdness", low: "Conventional", high: "Experimental" },
  { key: "beauty", low: "Plain", high: "Made to be looked at" },
  { key: "humour", low: "Straight-faced", high: "Funny" },
  { key: "tension", low: "Calm", high: "Nerve-shredding" },
  { key: "romance", low: "None", high: "Central" },
  { key: "violence", low: "None", high: "Constant" },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

export type Vector = Partial<Record<DimensionKey, number>>;

export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key) as DimensionKey[];

/** Nothing said about a dimension means the middle, not zero. */
export const NEUTRAL = 0.5;

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * How close two vectors are, over the dimensions that were actually asked
 * about.
 *
 * Weighted by how strongly each dimension was requested — distance from the
 * neutral middle — so a request that cares only about pace is not diluted by
 * eleven dimensions it never mentioned. Returns 0–1, where 1 is a perfect
 * match on everything that was asked for.
 */
export function similarity(want: Vector, has: Vector): number {
  let weighted = 0;
  let total = 0;

  for (const key of DIMENSION_KEYS) {
    const target = want[key];
    if (target === undefined) continue;

    // How much this dimension matters: a request for 0.9 or 0.1 is a strong
    // opinion, a request for 0.5 is barely a request at all.
    const weight = Math.abs(target - NEUTRAL) * 2;
    if (weight < 0.05) continue;

    const value = has[key] ?? NEUTRAL;
    weighted += weight * (1 - Math.abs(target - value));
    total += weight;
  }

  return total === 0 ? 0.5 : weighted / total;
}
