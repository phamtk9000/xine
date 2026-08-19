"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

/**
 * The opening spread: the article's artwork at full scale, one plate at a
 * time.
 *
 * Art arrives in whatever shape it wanted — a 2:3 poster, a 5:4 plate, a
 * cinematic banner — so every slide is contained rather than cropped. A
 * uniform crop would decapitate the posters, and these plates carry their own
 * type.
 *
 * The change between slides is the article's own motion vocabulary, set in
 * globals.css from `data-style`, so the carousel reads as part of the art
 * direction rather than a component bolted on top of it.
 */

export type Slide = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

const HOLD_MS = 2500;

export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);
  // Autoplay is a courtesy for a reader who isn't touching anything. The
  // moment they take control it stops for good, rather than fighting them.
  const [auto, setAuto] = useState(true);

  const count = slides.length;

  // Both of these advance from whatever is on screen rather than from the
  // index this render closed over, so two quick taps on the arrow move two
  // plates instead of collapsing into one.
  const step = useCallback(
    (delta: number) => {
      setActive((i) => (((i + delta) % count) + count) % count);
      setAuto(false);
    },
    [count],
  );

  const jump = useCallback((index: number) => {
    setActive(index);
    setAuto(false);
  }, []);

  useEffect(() => {
    if (!auto || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(
      () => setActive((i) => (i + 1) % count),
      HOLD_MS,
    );
    return () => window.clearInterval(timer);
  }, [auto, count]);

  // Arrow keys, but only while the carousel itself has focus — a reader
  // scrolling the article with the keyboard must not shuffle the pictures.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  }

  const current = slides[active];

  return (
    <section
      className="hero-carousel border-b border-line bg-ink-sunk"
      aria-roledescription="carousel"
      aria-label="Artwork from this article"
      tabIndex={count > 1 ? 0 : -1}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setAuto(false)}
      onFocus={() => setAuto(false)}
    >
      <div className="hero-stage">
        {slides.map((slide, i) => (
          <figure
            key={slide.src}
            className={`hero-slide${i === active ? " is-active" : ""}`}
            aria-hidden={i !== active}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              width={slide.width}
              height={slide.height}
              sizes="(max-width: 1024px) 100vw, 80vw"
              priority={i === 0}
              className="hero-plate"
            />
          </figure>
        ))}
      </div>

      <div className="hero-bar">
        <p className="hero-caption" aria-live="polite">
          {current.caption ? (
            <span dangerouslySetInnerHTML={{ __html: current.caption }} />
          ) : (
            <span className="text-faint">{current.alt}</span>
          )}
        </p>

        {count > 1 && (
          <div className="hero-controls">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous artwork"
              className="hero-step"
            >
              ←
            </button>

            <ol className="hero-ticks">
              {slides.map((slide, i) => (
                <li key={slide.src}>
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-label={`Artwork ${i + 1} of ${count}`}
                    aria-current={i === active}
                    className="hero-tick"
                  />
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next artwork"
              className="hero-step"
            >
              →
            </button>

            <p className="hero-count tabular-nums">
              {String(active + 1).padStart(2, "0")}
              <span className="text-faint">
                /{String(count).padStart(2, "0")}
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
