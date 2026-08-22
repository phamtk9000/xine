import { AXES, type AxisKey } from "@/lib/scores";

/**
 * Taste DNA — the five axes as a strip of film rather than a bar chart.
 *
 * A bar chart is a instrument reading: it invites you to compare lengths and
 * says nothing about what is being measured. This says cinema before it says
 * anything else. Five frames on a perforated strip, each exposed to the depth
 * of its score — a dark frame is an axis this person does not reward, a bright
 * one is an axis they do — so the profile reads as an image at a glance and
 * only resolves into numbers when you look closer.
 *
 * The frame colours are the archetype palette from lib/archetype.ts, so
 * somebody's DNA and the figure it makes them are visibly the same object.
 *
 * Drawn as one SVG with a viewBox and no fixed width, so it scales to any
 * column without reflowing, and every value is committed to geometry at
 * render — nothing here depends on the client.
 */

const AXIS_COLOR: Record<AxisKey, string> = {
  story: "#c9a227",
  direction: "#6c8ec9",
  visual: "#b5588f",
  performance: "#c96f4a",
  sound: "#4a9d8f",
};

const FRAME_W = 58;
const FRAME_H = 96;
const GAP = 8;
const PAD = 16;
const SPROCKET_H = 13;

export function TasteDna({
  scores,
  className,
}: {
  scores: Partial<Record<AxisKey, number | null>>;
  className?: string;
}) {
  const width = PAD * 2 + AXES.length * FRAME_W + (AXES.length - 1) * GAP;
  const height = FRAME_H + SPROCKET_H * 2 + 20;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
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
      {/* The stock itself. */}
      <rect
        x={0}
        y={0}
        width={width}
        height={FRAME_H + SPROCKET_H * 2}
        rx={3}
        fill="var(--color-ink-sunk)"
        stroke="var(--color-line)"
      />

      {/* Perforations, top and bottom. Spaced off the frame pitch so they
          line up with the frames the way real stock does. */}
      {Array.from({ length: AXES.length * 2 + 1 }, (_, i) => {
        const x = PAD - 6 + i * ((FRAME_W + GAP) / 2);
        return (
          <g key={i}>
            <rect x={x} y={4} width={7} height={5} rx={1.4} fill="var(--color-line)" />
            <rect
              x={x}
              y={FRAME_H + SPROCKET_H * 2 - 9}
              width={7}
              height={5}
              rx={1.4}
              fill="var(--color-line)"
            />
          </g>
        );
      })}

      {AXES.map(({ key, label }, i) => {
        const value = scores[key];
        const rated = typeof value === "number";
        const x = PAD + i * (FRAME_W + GAP);
        const y = SPROCKET_H;
        // Exposure: how much of the frame the score fills, from the base up.
        const fill = rated ? Math.max(0.06, value! / 10) : 0;
        const color = AXIS_COLOR[key];

        return (
          <g key={key}>
            <rect
              x={x}
              y={y}
              width={FRAME_W}
              height={FRAME_H}
              rx={2}
              fill="var(--color-ink)"
              stroke="var(--color-line)"
            />
            {rated && (
              <>
                <defs>
                  <linearGradient id={`dna-${key}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.28} />
                  </linearGradient>
                </defs>
                <rect
                  x={x + 1}
                  y={y + FRAME_H - FRAME_H * fill}
                  width={FRAME_W - 2}
                  height={FRAME_H * fill}
                  rx={1.5}
                  fill={`url(#dna-${key})`}
                />
                {/* The exposure line — where this axis actually sits. */}
                <rect
                  x={x + 1}
                  y={y + FRAME_H - FRAME_H * fill}
                  width={FRAME_W - 2}
                  height={1.4}
                  fill={color}
                />
              </>
            )}
            <text
              x={x + FRAME_W / 2}
              y={y + FRAME_H - 9}
              textAnchor="middle"
              fill="var(--color-paper)"
              fontSize={17}
              fontFamily="var(--font-display), Georgia, serif"
            >
              {rated ? value!.toFixed(1) : "—"}
            </text>
            <text
              x={x + FRAME_W / 2}
              y={height - 4}
              textAnchor="middle"
              fill="var(--color-faint)"
              fontSize={7.5}
              letterSpacing={1.4}
              fontFamily="var(--font-sans), system-ui, sans-serif"
            >
              {label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
