"use client";

import { useEffect } from "react";

/**
 * Reveals an article's figures, headings and pull quotes as they scroll in.
 *
 * The article body is server-rendered HTML, so there is nothing to hang a
 * per-element hook on in JSX — this walks the rendered container instead.
 *
 * Two rules keep it honest. It only ever hides elements that are already
 * below the fold when it runs, so nothing visible flashes out and back on
 * hydration and the page is fully readable if the script never loads. And it
 * bails entirely under `prefers-reduced-motion`.
 */

/** Article furniture. Body paragraphs are deliberately excluded — text a
 *  reader is mid-sentence on must not move. */
const TARGETS =
  "figure, h2, h3, blockquote, hr, .table-scroll, " +
  ".device-thesis, .device-interruption, .device-quote, .device-note";

/** Emphasis is inline and nested, so it is collected separately. It is never
 *  hidden — only shifted in colour — so an unreached phrase still reads. */
const EMPHASIS = "mark.emph";

export function Reveal({ selector }: { selector: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.querySelector(selector);
    if (!root) return;

    const belowFold = (el: Element) =>
      el.getBoundingClientRect().top > window.innerHeight * 0.9;

    // Anything already on screen, or above it, is left exactly as rendered.
    const pending = Array.from(root.children).filter(
      (el) => el.matches(TARGETS) && belowFold(el),
    );
    const marks = Array.from(root.querySelectorAll(EMPHASIS)).filter(belowFold);
    if (pending.length === 0 && marks.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove("art-off");
          entry.target.classList.add("art-in");
          observer.unobserve(entry.target);
        }
      },
      // Fires once the element is a little way past the bottom edge, so the
      // move has finished before it reaches reading position.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.04 },
    );

    for (const el of [...pending, ...marks]) {
      el.classList.add("art-off");
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [selector]);

  return null;
}
