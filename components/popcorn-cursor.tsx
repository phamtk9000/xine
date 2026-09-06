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

/** The kernel itself, small enough to sit in a data URI. */
const KERNEL = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <g transform="translate(2 2)">
    <circle cx="9" cy="9" r="6.5" fill="%23fdf6e3"/>
    <circle cx="14" cy="7" r="5" fill="%23fffdf5"/>
    <circle cx="7" cy="14" r="5" fill="%23f7ecd0"/>
    <circle cx="14" cy="14" r="4.5" fill="%23fdf6e3"/>
    <circle cx="10" cy="10" r="3" fill="%23fffef9"/>
  </g>
</svg>`;

const CURSOR = `url('data:image/svg+xml;utf8,${KERNEL.replace(/\n\s*/g, "")}') 12 12, auto`;

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
