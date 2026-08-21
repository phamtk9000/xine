import { ImageStreamHero } from "@/components/image-stream-hero";

/**
 * Somebody's watched films, flying at the reader.
 *
 * A band above the grid rather than instead of it. The corridor is
 * `aria-hidden` and its cards are not links — it is a portrait of a viewing
 * history, not a way to navigate one — so the grid underneath stays as the
 * thing you can actually read, search and click.
 *
 * Only films with real poster art ride the rails. A generated type plate is
 * fine at grid size, where it reads as a considered fallback; nine of them
 * rushing past at speed just looks like the images failed to load.
 */
export function WatchedCorridor({
  posters,
  children,
}: {
  posters: string[];
  children?: React.ReactNode;
}) {
  // Below this the ribbon can't stay solid — consecutive cards stop
  // overlapping and the corridor tears open. A short history is better served
  // by the grid alone.
  if (posters.length < 4) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-ink-sunk">
      <ImageStreamHero
        images={posters.map((src) => ({ src }))}
        cards={9}
        speed={26}
        axis={50}
        className="h-[300px] w-full sm:h-[380px]"
      >
        {/* Vignette: the cards leave frame at full size, and a hard rectangular
            edge makes them look clipped rather than passing by. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 62% 68% at 50% 50%, transparent 35%, var(--color-ink-sunk) 100%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      </ImageStreamHero>
    </div>
  );
}
