"use client";

import * as React from "react";

/**
 * A popcorn kernel for a cursor, and a burst of them on click.
 *
 * Pure decoration, and decoration has to earn its place by costing nothing.
 * So: one SVG cursor set through CSS rather than a element chasing the mouse
 * on every frame — a JS-positioned cursor lags the real pointer by a frame
 * at best and feels broken at worst — and the burst is a handful of absolutely
 * positioned spans that delete themselves when their animation ends.
 *
 * Three things it deliberately does not do.
 *
 * It does not touch text inputs, where a cursor that is not an I-beam makes
 * a field look unusable, and it leaves the pointer alone on interactive
 * elements that already say something with their cursor.
 *
 * It does not run for anybody who has asked for reduced motion. A burst of
 * flying particles on every click is exactly what that setting is for.
 *
 * And it does not run on touch, where there is no cursor to replace and the
 * burst would fire on every scroll tap.
 */

/**
 * A carton of popcorn, drawn to survive being 32 pixels wide.
 *
 * The first version was a cluster of pale blobs, which is what popcorn looks
 * like in close-up and not what it looks like as an icon — at cursor size it
 * read as an anonymous smudge. What makes popcorn legible that small is the
 * carton: red and white vertical stripes are recognisable as cinema at a
 * glance and at any size, and the kernels only have to spill over the top to
 * complete the idea.
 *
 * The kernels are deliberately not one smooth arc. Five overlapping circles
 * in a neat dome reads as scoops of ice cream; three smaller ones breaking
 * the outline at the edges is what makes it read as popcorn.
 *
 * The stripes are hand-computed trapezoids rather than a clipped pattern.
 * The carton tapers, so a stripe has to taper with it, and four literal
 * polygons are more reliable inside a data URI than a clipPath that every
 * browser has to agree about.
 *
 * A dark outline throughout, because a cursor crosses everything: near-black
 * page, white lightbox, and every colour a film poster can be. Bright fills
 * alone would vanish somewhere.
 *
 * `%23` rather than `#` — this string goes into a URL, where a hash starts
 * the fragment and would truncate every colour in the drawing.
 */
const POPCORN = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g stroke="%23241a12" stroke-width="1.3" stroke-linejoin="round">
    <circle cx="7.6" cy="10.2" r="2.7" fill="%23ffd977"/>
    <circle cx="24.6" cy="10.4" r="2.6" fill="%23ffd977"/>
    <circle cx="19.4" cy="4.6" r="2.8" fill="%23ffe9a8"/>
    <circle cx="11" cy="11.5" r="4.4" fill="%23ffd977"/>
    <circle cx="21.2" cy="11.5" r="4.4" fill="%23ffd977"/>
    <circle cx="16" cy="8.2" r="5" fill="%23ffe9a8"/>
    <circle cx="13.6" cy="14.4" r="3.9" fill="%23ffe9a8"/>
    <circle cx="19" cy="14.4" r="3.9" fill="%23ffd977"/>
    <path d="M6 15 H26 L22 29 H10 Z" fill="%23fff6ec"/>
    <path d="M6 15 H10 L12.4 29 H10 Z" fill="%23d92b2b" stroke="none"/>
    <path d="M14 15 H18 L17.2 29 H14.8 Z" fill="%23d92b2b" stroke="none"/>
    <path d="M22 15 H26 L22 29 H19.6 Z" fill="%23d92b2b" stroke="none"/>
    <path d="M6 15 H26 L22 29 H10 Z" fill="none"/>
  </g>
</svg>`;

/**
 * Hotspot at the top-left of the carton rather than its centre.
 *
 * A blob-shaped cursor with a centred hotspot feels like it clicks slightly
 * after where you aimed. Up and to the left is where every pointer people
 * have ever used puts its point, so that is where this one claims to be.
 */
const CURSOR = `url('data:image/svg+xml;utf8,${POPCORN.replace(/\n\s*/g, "")}') 6 5, auto`;

/** How many kernels fly out of a click, and how far. */
const PIECES = 7;
const SPREAD = 74;

export function PopcornCursor() {
  React.useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarse || still) return;

    // The cursor is set from here rather than in the stylesheet so that a
    // reader on a phone or with reduced motion never has it applied at all,
    // rather than having it applied and then argued with.
    const style = document.createElement("style");
    style.textContent = `
      body, body * { cursor: ${CURSOR}; }
      input, textarea, select, [contenteditable="true"] { cursor: text; }
      button, a, summary, label, [role="button"], input[type="range"],
      input[type="checkbox"], input[type="radio"] { cursor: ${CURSOR}; }
      :disabled { cursor: not-allowed; }
    `;
    document.head.append(style);

    const onClick = (event: MouseEvent) => {
      // Left button only: a right-click opens a menu, and confetti under a
      // context menu is somebody else's idea of a good time.
      if (event.button !== 0) return;

      const burst = document.createElement("div");
      burst.className = "popcorn-burst";
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;

      for (let i = 0; i < PIECES; i++) {
        const piece = document.createElement("span");
        // Fanned upward rather than in a full circle: popcorn pops up, and a
        // uniform ring reads as a generic particle effect instead.
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
        const distance = SPREAD * (0.45 + Math.random() * 0.75);
        piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
        piece.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
        piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 540}deg`);
        piece.style.setProperty("--delay", `${Math.random() * 60}ms`);
        piece.style.setProperty("--size", `${7 + Math.random() * 7}px`);
        burst.append(piece);
      }

      document.body.append(burst);
      // Removed on the last piece's animation rather than a matching timeout,
      // so the two can never drift apart when the duration changes.
      let done = 0;
      burst.addEventListener("animationend", () => {
        if (++done >= PIECES) burst.remove();
      });
      // A belt-and-braces sweep for the case where the tab was backgrounded
      // mid-animation and the events never fired.
      window.setTimeout(() => burst.remove(), 1600);
    };

    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("pointerdown", onClick);
      style.remove();
    };
  }, []);

  return null;
}
