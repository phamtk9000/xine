"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up once, when it first scrolls into view.
 *
 * Server-renders the *final* value, not zero. If the script never loads, or
 * the reader has reduced motion on, the page still shows the real figure —
 * the animation is an enhancement laid over correct output rather than the
 * thing that produces it.
 *
 * Eased out, so it decelerates into the number instead of stopping dead.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 1100,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let safety = 0;
    let cancelled = false;

    const finish = () => {
      if (!cancelled) setShown(value);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        // Never start what we can't be sure of finishing. rAF does not run in
        // a hidden or backgrounded tab, so dropping to zero there would strand
        // the figure at 0 with no frame ever arriving to lift it — the reader
        // would be looking at a wrong number, not a missing animation.
        if (document.visibilityState !== "visible") return;

        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / duration);
          // easeOutCubic
          const eased = 1 - Math.pow(1 - t, 3);
          // Land on the exact value rather than value * 0.999...
          setShown(t < 1 ? value * eased : value);
          if (t < 1) frame = requestAnimationFrame(tick);
        };

        // Drop to zero and run only once we know it is on screen, so the
        // reader never sees the number reset after having read it.
        setShown(0);
        frame = requestAnimationFrame(tick);

        // Belt and braces: if frames stop arriving mid-flight — the tab is
        // backgrounded, the renderer is throttled — snap to the real figure
        // rather than leaving a half-counted one on screen.
        safety = window.setTimeout(finish, duration + 400);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(safety);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {shown.toFixed(decimals)}
    </span>
  );
}
