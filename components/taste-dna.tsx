import { AXES, type AxisKey } from "@/lib/scores";

/**
 * Taste DNA — the five axes as one irregular shape.
 *
 * A bar chart asks you to compare five lengths and reports nothing about the
 * person as a whole. A closed polygon has a silhouette: it is lopsided toward
 * whatever they reward, and two viewers are told apart at a glance by outline
 * alone, before a single number is read. That is the point of calling it DNA
 * rather than a breakdown.
 *
 * Deliberately not a radar chart. No concentric grid, no spokes to the rim,
 * no axis ticks — those are the furniture that makes radar charts read as
 * analytics. What is left is the shape, one faint reference ring for the
 * scale, and the vertices.
 *
 * The scale starts at 5, not 0. Ratings in practice live between about 6 and
 * 10, so a 0-based polygon is a near-perfect pentagon for everybody and tells
 * you nothing; anchoring the floor at the bottom of the real range is what
 * makes the lopsidedness visible.
 *
 * Colours are the archetype palette from lib/archetype.ts, so somebody's DNA
 * and the figure it makes them are visibly the same object.
 */

const AXIS_COLOR: Record<AxisKey, string> = {
  story: "#c9a227",
  direction: "#6c8ec9",
  visual: "#b5588f",
  performance: "#c96f4a",
  sound: "#4a9d8f",
};

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2 + 4;
const R = 84;
/** Scores below this all collapse to the centre — see the note above. */
const FLOOR = 5;

function point(index: number, count: number, radius: number) {
  // Start at twelve o'clock and go clockwise, so Story is always at the top
  // and the same profile always draws the same way round.
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius] as const;
}

export function TasteDna({
  scores,
  className,
}: {
  scores: Partial<Record<AxisKey, number | null>>;
  className?: string;
}) {
  const n = AXES.length;
  const rated = AXES.filter(({ key }) => typeof scores[key] === "number");

  // Fewer than three vertices cannot enclose anything.
  if (rated.length < 3) {
    return (
      <p className={`text-sm text-muted ${className ?? ""}`}>
        Rate a few films on the breakdown and your shape appears here.
      </p>
    );
  }

  const radius = (v: number | null | undefined) =>
    typeof v === "number"
      ? Math.max(0.12, (v - FLOOR) / (10 - FLOOR)) * R
      : 0.12 * R;

  const hull = AXES.map(({ key }, i) => point(i, n, radius(scores[key])));
  const path = hull.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Blend the axis colours in proportion to what they actually score, so the
  // fill of a Visual-led profile leans magenta without being told to.
  const total = AXES.reduce(
    (s, { key }) => s + (typeof scores[key] === "number" ? scores[key]! : 0),
    0,
  );

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      role="img"
      aria-label={
        "Taste DNA: " +
        AXES.map(({ key, label }) =>
          typeof scores[key] === "number"
            ? `${label} ${scores[key]!.toFixed(1)}`
            : `${label} unrated`,
        ).join(", ")
      }
    >
      <defs>
        <radialGradient id="dna-fill" cx="50%" cy="50%" r="60%">
          {AXES.map(({ key }, i) => (
            <stop
              key={key}
              offset={`${(i / (n - 1)) * 100}%`}
              stopColor={AXIS_COLOR[key]}
              stopOpacity={
                total > 0 && typeof scores[key] === "number"
                  ? 0.1 + (scores[key]! / total) * 1.6
                  : 0.1
              }
            />
          ))}
        </radialGradient>
      </defs>

      {/* One reference ring at 8.0, the only scale mark. Anything more and it
          becomes a radar chart again. */}
      <polygon
        points={AXES.map((_, i) => point(i, n, radius(8)))
          .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ")}
        fill="none"
        stroke="var(--color-line)"
        strokeDasharray="2 4"
      />

      <polygon
        points={path}
        fill="url(#dna-fill)"
        stroke="var(--color-paper)"
        strokeOpacity={0.55}
        strokeWidth={1.25}
        strokeLinejoin="round"
      />

      {AXES.map(({ key, label }, i) => {
        const has = typeof scores[key] === "number";
        const [vx, vy] = hull[i];
        const [lx, ly] = point(i, n, R + 30);
        return (
          <g key={key}>
            {has && <circle cx={vx} cy={vy} r={3} fill={AXIS_COLOR[key]} />}
            <text
              x={lx}
              y={ly - 4}
              textAnchor="middle"
              fill="var(--color-faint)"
              fontSize={7.5}
              letterSpacing={1.5}
              fontFamily="var(--font-sans), system-ui, sans-serif"
            >
              {label.toUpperCase()}
            </text>
            <text
              x={lx}
              y={ly + 9}
              textAnchor="middle"
              fill={has ? AXIS_COLOR[key] : "var(--color-faint)"}
              fontSize={14}
              fontFamily="var(--font-display), Georgia, serif"
            >
              {has ? scores[key]!.toFixed(1) : "—"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
