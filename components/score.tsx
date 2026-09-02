import { AXES, formatScore, type AxisKey, type AxisScores } from "@/lib/scores";

export function ScoreDial({
  value,
  label,
  size = "md",
  accent = false,
}: {
  value: number | null;
  label: string;
  size?: "sm" | "md" | "lg";
  accent?: boolean;
}) {
  const sizes = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
  };
  return (
    <div>
      <p className="label">{label}</p>
      <p
        className={`mt-1.5 font-display leading-none tabular-nums ${sizes[size]} ${
          value === null ? "text-faint" : accent ? "text-gold" : "text-paper"
        }`}
      >
        {formatScore(value)}
        {value !== null && (
          <span className="ml-1 font-sans text-xs tracking-normal text-faint">
            /10
          </span>
        )}
      </p>
    </div>
  );
}

/** Compact inline score, used on cards and in lists. */
export function ScorePill({
  value,
  muted = false,
}: {
  value: number | null;
  muted?: boolean;
}) {
  if (value === null) return null;
  return (
    <span
      className={`readout text-xs ${
        muted ? "text-muted" : "text-gold"
      }`}
    >
      {formatScore(value)}
    </span>
  );
}

/**
 * The five-axis breakdown. Bars are relative to 10 and always drawn in the
 * same order, so two films can be compared by shape at a glance — which is
 * the entire reason for collecting the extra numbers.
 */
export function AxisBreakdown({
  scores,
  compact = false,
}: {
  scores: AxisScores;
  compact?: boolean;
}) {
  const filled = AXES.filter(({ key }) => typeof scores[key] === "number");
  if (filled.length === 0) return null;

  return (
    <dl className={compact ? "space-y-2" : "space-y-3.5"}>
      {AXES.map(({ key, label }) => {
        const value = scores[key];
        return (
          <div key={key} className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-3">
            <dt
              className={`label ${compact ? "text-[0.625rem]" : ""} !normal-case !tracking-normal`}
            >
              {label}
            </dt>
            <dd className="h-px bg-line" aria-hidden>
              {typeof value === "number" && (
                <div
                  className="h-px bg-gold"
                  style={{ width: `${(value / 10) * 100}%` }}
                />
              )}
            </dd>
            <dd className="text-right readout text-xs text-muted">
              {formatScore(value ?? null)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Column of five thin bars — a rating's silhouette, for cards and profiles. */
export function AxisSpark({ scores }: { scores: AxisScores }) {
  const values = AXES.map(({ key }) => scores[key]);
  if (values.every((v) => typeof v !== "number")) return null;

  return (
    <div className="flex h-5 items-end gap-[3px]" aria-hidden>
      {values.map((value, i) => (
        <div
          key={AXES[i].key}
          className="w-[3px] rounded-full bg-gold/70"
          style={{
            height: typeof value === "number" ? `${(value / 10) * 100}%` : "6%",
            opacity: typeof value === "number" ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

export function axisLabel(key: AxisKey) {
  return AXES.find((a) => a.key === key)?.label ?? key;
}
