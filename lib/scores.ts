/**
 * The rating model, in one place.
 *
 * Everything is on a 0–10 scale to one decimal. The five axes are optional:
 * a rating with only `overall` is valid and is what most people will leave.
 * When someone does fill the breakdown, `overall` is derived from it unless
 * they have explicitly overridden it.
 */

export const AXES = [
  { key: "story", label: "Story" },
  { key: "direction", label: "Direction" },
  { key: "visual", label: "Visual" },
  { key: "performance", label: "Performance" },
  { key: "sound", label: "Sound" },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];

export type AxisScores = Partial<Record<AxisKey, number | null>>;

export type ScoreSet = AxisScores & { overall: number };

/** Average of whichever axes were actually filled in. Null if none were. */
export function deriveOverall(axes: AxisScores): number | null {
  const values = AXES.map(({ key }) => axes[key]).filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v),
  );
  if (values.length === 0) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return round1(mean);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(10, Math.max(0, round1(value)));
}

/** Mean of a column across many ratings, ignoring the rows that left it blank. */
export function averageAxis(
  ratings: AxisScores[],
  key: AxisKey,
): number | null {
  const values = ratings
    .map((r) => r[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function averageOverall(ratings: { overall: number }[]): number | null {
  if (ratings.length === 0) return null;
  return round1(
    ratings.reduce((sum, r) => sum + r.overall, 0) / ratings.length,
  );
}

/** Display string: always one decimal, so 8 reads as 8.0 and columns line up. */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(1);
}

/**
 * Which axis a set of scores leans on hardest, relative to its own average.
 * This is what makes a taste profile interesting: not "you rate things 7.4"
 * but "you reward Visual and discount Story".
 */
export function dominantAxis(ratings: AxisScores[]): {
  key: AxisKey;
  label: string;
  lean: number;
} | null {
  const means: { key: AxisKey; label: string; mean: number }[] = [];
  for (const { key, label } of AXES) {
    const mean = averageAxis(ratings, key);
    if (mean !== null) means.push({ key, label, mean });
  }
  if (means.length < 2) return null;

  const grand = means.reduce((sum, a) => sum + a.mean, 0) / means.length;
  const top = means.reduce((best, a) => (a.mean > best.mean ? a : best));
  return { key: top.key, label: top.label, lean: round1(top.mean - grand) };
}
