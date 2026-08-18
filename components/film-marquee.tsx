import { FilmCard } from "@/components/film-card";
import type { FilmSummary } from "@/lib/films";

/**
 * New releases, running continuously right to left.
 *
 * Two identical tracks sit side by side and both translate by exactly one
 * track's width, so the second is in position the instant the first leaves —
 * the loop has no seam and no JavaScript. The whole thing halts on hover or
 * keyboard focus, because a row that keeps moving while you are trying to
 * read a title is hostile.
 *
 * Under `prefers-reduced-motion` the animation is not applied at all and the
 * row becomes an ordinary horizontal scroller instead. That guard is load
 * bearing: the global reduced-motion override collapses every duration to
 * 0.001ms, which for a marquee means it teleports to the end rather than
 * standing still.
 */

export function FilmMarquee({ films }: { films: FilmSummary[] }) {
  if (films.length === 0) return null;

  return (
    <div className="marquee" aria-label="New releases, scrolling">
      <ul className="marquee-track">
        {films.map((film) => (
          <li key={film.id} className="marquee-item">
            <FilmCard film={film} />
          </li>
        ))}
      </ul>
      {/* The duplicate is decoration; a screen reader should hear the list once. */}
      <ul className="marquee-track" aria-hidden="true">
        {films.map((film) => (
          <li key={`${film.id}-echo`} className="marquee-item">
            <FilmCard film={film} />
          </li>
        ))}
      </ul>
    </div>
  );
}
