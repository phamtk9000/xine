"use client";

import { useEffect } from "react";

/**
 * Staggers a grid's direct children in as they scroll into view — the home
 * page's equivalent of components/reveal.tsx, generalised for a poster grid
 * or a card list instead of an article's own furniture.
 *
 * Same two rules as the article version, for the same reasons: it only ever
 * hides elements that are already below the fold when it mounts, so nothing
 * visible flashes out and back on hydration and the page is fully readable
 * with the script absent; and it bails entirely under
 * `prefers-reduced-motion`.
 *
 * The stagger is capped rather than growing with the grid — a twenty-poster
 * grid staggered at a flat 70ms would take 1.4s for the last row to arrive,
 * which reads as sluggish rather than considered. Past the cap, everything
 * still lands together instead of trailing off forever.
 */

const STAGGER_MS = 55;
const STAGGER_CAP = 10;

export function RevealGroup({
  selector,
  stagger = STAGGER_MS,
}: {
  selector: string;
  stagger?: number;
}) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.querySelector(selector);
    if (!root) return;

    const pending = Array.from(root.children).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
    );
    if (pending.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const index = pending.indexOf(el);
          const delay = Math.min(index, STAGGER_CAP) * stagger;
          // The reveal is a CSS `animation`, not a `transition` — the two
          // have separate delay properties, and setting the wrong one is a
          // silent no-op rather than an error.
          el.style.animationDelay = `${delay}ms`;
          el.classList.remove("reveal-off");
          el.classList.add("reveal-in");
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    for (const el of pending) {
      el.classList.add("reveal-off");
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [selector, stagger]);

  return null;
}
