"use client";

import { useEffect, useState } from "react";

/**
 * One recurring micro-element, on every article: which section you are in.
 *
 * Not a progress bar. A progress bar tells a reader how much is left, which
 * is a reason to stop; a section marker tells them where they are, which is
 * a reason to keep going. It reads `XINE — 03 / 09` and nothing else.
 *
 * It appears once the first section heading has passed and hides again at
 * the end of the article, so it is never floating over the opening spread or
 * the footer.
 */

export function ReadingMarker({ selector }: { selector: string }) {
  const [state, setState] = useState<{ index: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    const root = document.querySelector(selector);
    if (!root) return;

    const headings = Array.from(root.children).filter(
      (el) => el.tagName === "H2",
    );
    if (headings.length < 2) return;

    // A plain scroll handler rather than an observer: the answer is "which
    // heading is the last one above the reading line", which is one pass over
    // a handful of rects — cheaper and more direct than reconciling a stream
    // of intersection events, and correct on the first paint.
    function update() {
      const line = window.innerHeight * 0.35;
      let index = -1;

      headings.forEach((heading, i) => {
        if (heading.getBoundingClientRect().top <= line) index = i;
      });

      const end = root!.getBoundingClientRect().bottom;
      const past = end < window.innerHeight * 0.5;

      setState(
        index < 0 || past ? null : { index: index + 1, total: headings.length },
      );
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [selector]);

  if (!state) return null;

  return (
    <p className="reading-marker" aria-hidden="true">
      xine
      <span className="reading-marker-rule" />
      <span className="tabular-nums">
        {String(state.index).padStart(2, "0")}
        <span className="text-faint">
          {" "}
          / {String(state.total).padStart(2, "0")}
        </span>
      </span>
    </p>
  );
}
