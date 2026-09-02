import { ImageStreamHero, type StreamImage } from "@/components/image-stream-hero";

/** Films per rail. Thirty films, dealt alternately, is fifteen a side. */
const PER_RAIL = 15;

/**
 * Never fewer than the corridor's own default. Card size is geometric across
 * the whole run, so cutting the count widens the ratio between neighbours —
 * at six a side the jump is 62% a step, the ribbon comes apart into scattered
 * chips, and the far cards shrink to 30px. Short lists repeat instead, which
 * the corridor supports and which nobody notices.
 */
const MIN_PER_RAIL = 9;

/**
 * Somebody's best-rated films, flying at the reader.
 *
 * A band above the grid rather than instead of it. The cards are clickable —
 * hovering stops the corridor and lifts the one under the pointer — but the
 * whole thing stays `aria-hidden` with nothing focusable in it, because a
 * moving link is a bad target for a keyboard and every film here also appears
 * in the static grid below. That grid is the accessible route; this is the
 * shop window.
 *
 * Only films with real poster art ride the rails. A generated type plate
 * reads as a considered fallback at grid size; a dozen of them rushing past
 * just looks like the images failed to load.
 */
export function WatchedCorridor({ films }: { films: StreamImage[] }) {
  // Below this the ribbon can't stay solid — consecutive cards stop
  // overlapping and the corridor tears open. A short history is better served
  // by the grid alone.
  if (films.length < 4) return null;

  const perRail = Math.min(
    PER_RAIL,
    Math.max(MIN_PER_RAIL, Math.ceil(films.length / 2)),
  );

  return (
    <div className="relative overflow-hidden rounded-[4px] border border-line bg-ink-sunk">
      <ImageStreamHero
        images={films}
        split
        interactive
        cards={perRail}
        speed={30}
        axis={50}
        className="h-[300px] w-full sm:h-[420px]"
      >
        {/* Vignette. The cards leave frame at full size, and a hard
            rectangular edge makes them look clipped rather than passing by.
            pointer-events-none so it never eats a click meant for a card. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 64% 70% at 50% 50%, transparent 42%, var(--color-ink-sunk) 100%)",
          }}
        />
      </ImageStreamHero>
    </div>
  );
}
