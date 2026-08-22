"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/* ── the corridor ────────────────────────────────────────────────
 * Two rails of cards ride from far behind the screen toward the
 * viewer. Perspective alone does the work that looks like two
 * animations: as a card's z grows it gets bigger *and* its screen x
 * sweeps outward from the vanishing point, because the projection
 * scales position and size by the same factor.
 *
 * Three things shape it, and each one fixes a specific artefact:
 *
 * 1. Depth is authored as *apparent size*, geometrically — each card
 *    is a constant ratio bigger than the one behind it, all the way
 *    out. Spacing a straight z-range evenly instead makes the near
 *    cards tear apart from each other as the projection blows up.
 * 2. The rails open hard in the first stretch and then hold
 *    (`fan` > 1). That opening cancels the — still slow — growth back
 *    there, so the ribbon leaves the centre as a flat band, bends
 *    once, and only then runs out on the diagonal. Parallel rails
 *    project to a straight cone with no bend at all.
 * 3. Neither end of the loop is ever on screen. A card dies with its
 *    inner edge past 50cqw, clear of the container's edge. And it is
 *    born *across* the axis — `railBirth` is negative, so the newest
 *    card starts on the far side and sweeps back through the centre.
 *    That plugs the throat: the axis stays covered at every instant,
 *    and a newborn lands behind cards that already cover it, so it
 *    needs no fade in. Birthing on its own side instead leaves a hole
 *    at dead centre that blinks open once every cycle.
 *
 * Every length is in `cqw` — a percentage of the container's width —
 * so the whole corridor keeps its proportions at any size. The
 * defaults were fitted numerically against a reference recording's
 * card-height and edge-position profile, not eyeballed.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Geometry of the corridor. Every length is `cqw`, a percentage of the
 * container's width, so the shape is resolution-independent.
 *
 * These interact: the ribbon only stays solid while consecutive cards
 * overlap, which needs `exitHeight / birthHeight` spread over enough
 * `cards`. Raising `exitHeight`, dropping `cards`, or pulling `railExit`
 * in all push toward a visible tear near the frame edge.
 */
export type CorridorPath = {
  /** Strength of the projection. Lower is a wider-angle, more dramatic rush. @default 30 */
  perspective?: number;
  /** Card width in world units. @default 18 */
  cardWidth?: number;
  /** Card height in world units. @default 25 */
  cardHeight?: number;
  /** Corner radius applied to each card. @default 0.4 */
  cardRadius?: number;
  /** On-screen card height at the waist, where a card is born. @default 2.6 */
  birthHeight?: number;
  /** On-screen card height as a card leaves the frame. @default 46 */
  exitHeight?: number;
  /**
   * Lateral offset at birth. Negative starts the card across the axis so the
   * centre never opens up — see note 3 above. @default -11
   */
  railBirth?: number;
  /** Lateral offset once the rails have finished opening. @default 44 */
  railExit?: number;
  /** How front-loaded the opening is. >1 opens early then holds. @default 3.3 */
  fan?: number;
  /** Y-rotation at birth, degrees. @default 6 */
  turnBirth?: number;
  /** Y-rotation at exit, degrees. @default 28 */
  turnExit?: number;
  /** Keyframe stops used to trace the curve. Raise only if motion looks faceted. @default 24 */
  stops?: number;
};

const PATH: Required<CorridorPath> = {
  perspective: 30,
  cardWidth: 18,
  cardHeight: 25,
  cardRadius: 0.4,
  birthHeight: 2.6,
  exitHeight: 46,
  railBirth: -11,
  railExit: 44,
  fan: 3.3,
  turnBirth: 6,
  turnExit: 28,
  stops: 24,
};

/** Sample the path once so the CSS keyframes trace the real curve. */
function keyframes(dir: 1 | -1, name: string, p: Required<CorridorPath>) {
  const steps: string[] = [];
  for (let s = 0; s <= p.stops; s++) {
    const u = s / p.stops;
    // Geometric in apparent size, so consecutive cards keep a constant size
    // ratio and the ribbon stays solid at both ends.
    const scale =
      (p.birthHeight / p.cardHeight) *
      Math.pow(p.exitHeight / p.birthHeight, u);
    const z = p.perspective * (1 - 1 / scale);
    const rail =
      p.railExit - (p.railExit - p.railBirth) * Math.pow(1 - u, p.fan);
    const turn = p.turnBirth + (p.turnExit - p.turnBirth) * u;
    steps.push(
      `${(u * 100).toFixed(2)}%{transform:translate3d(${(dir * rail).toFixed(
        2,
      )}cqw,0,${z.toFixed(2)}cqw) rotateY(${(-dir * turn).toFixed(2)}deg)}`,
    );
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

export type StreamImage = {
  src: string;
  /** Only used if you drop the decorative treatment; the corridor is aria-hidden. */
  alt?: string;
  /** Makes the card clickable. See `interactive` on the hero. */
  href?: string;
  /** Shown over the card while it is hovered. */
  title?: string;
};

export type ImageStreamHeroProps = {
  /**
   * Images cycled onto the rails. Both rails run the same sequence, so the
   * corridor reads as one mirrored stream. Fewer than `cards` simply repeat.
   */
  images: StreamImage[];
  /**
   * Cards on each rail at once. More cards means a denser corridor, not a
   * faster one — spacing is derived from this and `speed`. Drop it far below
   * the default and consecutive cards grow too fast to stay overlapped near
   * the exit, which tears a gap in the ribbon.
   * @default 9
   */
  cards?: number;
  /**
   * Seconds for one card to travel the whole corridor.
   * @default 18
   */
  speed?: number;
  /**
   * Vertical placement of the corridor's axis, as a percentage of height.
   * @default 55
   */
  axis?: number;
  /**
   * Deal alternating images to the two rails instead of running the same
   * sequence down both. Interleaved rather than halved, so if the list is in
   * rank order each rail still carries a spread of it rather than one rail
   * taking all the best.
   * @default false
   */
  split?: boolean;
  /**
   * Let the pointer stop and click the cards.
   *
   * The corridor stays `aria-hidden` and every card is `tabIndex={-1}`
   * even here. Focusable targets that drift across the screen are a bad
   * bargain for keyboard and screen-reader users, and these links are always
   * a duplicate of a static list elsewhere on the page — so the accessible
   * path is that list, not a moving one.
   *
   * Hovering the corridor pauses every card. Without that you would be
   * aiming at a target that is accelerating away from you.
   * @default false
   */
  interactive?: boolean;
  /** Override any part of the corridor geometry. Merged over the defaults. */
  path?: CorridorPath;
  /** Content rendered above the corridor. */
  children?: React.ReactNode;
  className?: string;
};

export function ImageStreamHero({
  images,
  cards = 9,
  speed = 18,
  axis = 55,
  split = false,
  interactive = false,
  path,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & ImageStreamHeroProps) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const right = `ish-r-${id}`;
  const left = `ish-l-${id}`;
  const card = `ish-c-${id}`;
  const rail = `ish-rail-${id}`;
  const skin = `ish-s-${id}`;
  const cap = `ish-cap-${id}`;

  const p = React.useMemo(() => ({ ...PATH, ...path }), [path]);

  const css = React.useMemo(
    () =>
      `${keyframes(1, right, p)}${keyframes(-1, left, p)}` +
      // Pausing rather than disabling keeps the corridor whole: every card is
      // already dropped mid-flight by its negative delay, so it freezes as a
      // finished still instead of collapsing onto the axis.
      `@media(prefers-reduced-motion:reduce){.${card}{animation-play-state:paused}}` +
      (interactive
        ? // Entering the band halts the corridor, so a card can be aimed at
          // instead of chased.
          `.${rail}:hover .${card}{animation-play-state:paused}` +
          // Dimming is scoped with :has to a card actually being hovered.
          // Keyed off `.rail:hover` instead, the whole corridor greyed out
          // the moment the pointer crossed any empty black space in the band.
          // Where :has is unsupported this rule simply never matches, and the
          // corridor keeps its normal brightness — no fallback needed.
          `.${rail}:has(.${card}:hover) .${card} .${skin}{opacity:.32;filter:saturate(.55)}` +
          `.${card}:hover{z-index:50}` +
          // The scale sits on the face, never on the card: the card's own
          // transform is the keyframe that flies it down the corridor, and
          // anything written there is overwritten on the next frame.
          `.${rail} .${card}:hover .${skin}{opacity:1;filter:none;transform:scale(1.18);box-shadow:0 0 0 .18cqw var(--color-gold),0 1cqw 3cqw rgba(0,0,0,.65)}` +
          `.${card} .${cap}{opacity:0;transition:opacity .18s ease}` +
          `.${card}:hover .${cap}{opacity:1}`
        : ""),
    [right, left, card, rail, skin, cap, interactive, p],
  );

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      {...props}
      style={{ containerType: "inline-size", ...props.style }}
    >
      <style>{css}</style>

      <div
        aria-hidden
        className={cn(
          rail,
          "absolute inset-0",
          interactive ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{
          perspective: `${p.perspective}cqw`,
          perspectiveOrigin: `50% ${axis}%`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {[right, left].map((name, side) => {
            // Mirrored by default. Split deals alternate entries to each
            // rail, so the two sides never show the same film at once.
            const pool = split
              ? images.filter((_, n) => n % 2 === side)
              : images;

            return Array.from({ length: cards }, (_, i) => {
              const img = pool[i % Math.max(pool.length, 1)];
              return (
                <div
                  key={`${name}-${i}`}
                  className={cn(card, "absolute")}
                  style={{
                    left: "50%",
                    top: `${axis}%`,
                    width: `${p.cardWidth}cqw`,
                    height: `${p.cardHeight}cqw`,
                    marginLeft: `${-p.cardWidth / 2}cqw`,
                    marginTop: `${-p.cardHeight / 2}cqw`,
                    animation: `${name} ${speed}s linear infinite`,
                    // Negative delay drops each card mid-flight, so the
                    // corridor is already full on the first frame.
                    animationDelay: `${-(i * speed) / cards}s`,
                    backfaceVisibility: "hidden",
                  }}
                >
                  {img ? (
                    <CardFace
                      img={img}
                      interactive={interactive}
                      skin={skin}
                      cap={cap}
                      radius={p.cardRadius}
                    />
                  ) : null}
                </div>
              );
            });
          })}
        </div>
      </div>

      {children}
    </div>
  );
}

/**
 * One card's contents. Split out because the interactive version wraps the
 * same picture in an anchor, and duplicating the img tag in two branches is
 * how the two drift apart.
 */
function CardFace({
  img,
  interactive,
  skin,
  cap,
  radius,
}: {
  img: StreamImage;
  interactive: boolean;
  skin: string;
  cap: string;
  radius: number;
}) {
  // The clipping and rounding live here rather than on the animated card, so
  // the face can scale on hover and still keep its corners.
  const faceClass = cn(
    skin,
    "block h-full w-full overflow-hidden transition-[opacity,filter,box-shadow,transform] duration-200",
  );
  const faceStyle = { borderRadius: `${radius}cqw` };

  const inner = (
    <>
      {/* Plain img, not next/image: these are fixed-size decorative cards
          sized in cqw, so there is no layout for the optimiser to protect and
          nine of them would be nine more optimiser requests per rail. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.src}
        alt={img.alt ?? ""}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {interactive && img.title ? (
        <span
          className={cn(
            cap,
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-[0.6cqw] pt-[2cqw] pb-[0.6cqw] text-center text-[1.05cqw] leading-tight font-medium text-white",
          )}
        >
          {img.title}
        </span>
      ) : null}
    </>
  );

  if (!interactive || !img.href) {
    return (
      <span className={faceClass} style={faceStyle}>
        {inner}
      </span>
    );
  }

  // The anchor IS the face, so the clickable area is exactly the thing that
  // grows — a separate wrapper would leave the hit box at the original size
  // while the picture overflowed past it.
  return (
    <a
      href={img.href}
      // Never focusable: see `interactive` on the hero. The keyboard route to
      // these films is the static list this corridor sits above.
      tabIndex={-1}
      className={faceClass}
      style={faceStyle}
      draggable={false}
    >
      {inner}
    </a>
  );
}

export default ImageStreamHero;
