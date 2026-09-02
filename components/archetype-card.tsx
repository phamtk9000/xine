import Link from "next/link";
import type { Reading } from "@/lib/archetype";

/**
 * The figure, as a card.
 *
 * The emblem is drawn rather than illustrated — a photograph would make it a
 * person, and the whole point is that it is a role the reader steps into.
 * Every type keeps the same frame and swaps only its colour and glyph, so a
 * type is recognisable at a glance across the site.
 */
export function ArchetypeCard({
  reading,
  href,
  compact = false,
}: {
  reading: Reading;
  href?: string;
  compact?: boolean;
}) {
  const { archetype: a, lean, temper } = reading;

  const body = (
    <>
      <div className="flex items-center gap-4">
        <ArchetypeGlyph archetype={a} size={compact ? 40 : 52} />
        <div>
          <p
            className="font-sans text-[0.625rem] tracking-[0.16em] uppercase"
            style={{ color: a.color }}
          >
            Your type
          </p>
          <p
            className={`font-display leading-none ${compact ? "text-3xl" : "text-4xl"}`}
          >
            {a.name}
          </p>
        </div>
      </div>

      <p className="mt-5 font-display text-xl leading-snug text-muted italic">
        &ldquo;{a.epithet}&rdquo;
      </p>

      {!compact && (
        <>
          <p className="mt-5 text-sm leading-relaxed text-muted">{a.blurb}</p>
          <p className="mt-4 border-l-2 pl-4 text-sm leading-relaxed text-faint" style={{ borderColor: a.color }}>
            {a.blindSpot}
          </p>
        </>
      )}

      {temper && (
        <p className="mt-4 text-sm leading-relaxed" style={{ color: a.color }}>
          {temper}
        </p>
      )}

      {lean > 0 && (
        <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
          Lean {lean.toFixed(1)} above your other axes
        </p>
      )}
    </>
  );

  const frame =
    "rounded-[4px] border p-6 transition-colors" +
    (href ? " hover:bg-ink-raised" : "");

  if (href) {
    return (
      <Link
        href={href}
        className={`block ${frame}`}
        style={{ borderColor: `${a.color}55` }}
      >
        {body}
        <p
          className="mt-5 font-sans text-[0.625rem] tracking-[0.16em] uppercase"
          style={{ color: a.color }}
        >
          Find others of this type →
        </p>
      </Link>
    );
  }

  return (
    <div className={frame} style={{ borderColor: `${a.color}55` }}>
      {body}
    </div>
  );
}

export function ArchetypeGlyph({
  archetype,
  size = 48,
}: {
  archetype: { color: string; glyph: string; name: string };
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={archetype.color}
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={archetype.name}
      className="shrink-0"
    >
      <path d={archetype.glyph} />
    </svg>
  );
}
