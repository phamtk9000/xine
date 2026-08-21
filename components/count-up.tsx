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
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / duration);
          // easeOutCubic
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(value * eased);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        // Drop to zero and run only once we know it is on screen, so the
        // reader never sees the number reset after having read it.
        setShown(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {shown.toFixed(decimals)}
    </span>
  );
}
