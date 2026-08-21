import {
  CoverflowCarousel,
  type CoverflowSlide,
} from "@/components/coverflow-carousel";
import { SealMark } from "@/components/seal";
import { Poster } from "@/components/poster";
import type { FilmSummary } from "@/lib/films";

/**
 * Trending, as a coverflow rake rather than a poster grid.
 *
 * Server component: it turns films into slides and pre-renders each centred
 * film's badge, so the carousel itself stays a dumb presentational client
 * component and the seal logic stays on the server where the rest of it
 * lives.
 *
 * Films without poster art fall back to the generated type plate the grid
 * already uses — a coverflow of grey rectangles would be worse than the grid
 * it replaced, and the plate at least reads as a designed object.
 */
export function TrendingCoverflow({ films }: { films: FilmSummary[] }) {
  const withArt = films.filter((film) => film.posterUrl);

  // The rake needs enough cards to actually rake — below about five the
  // outer positions are empty and it reads as a broken grid.
  if (withArt.length < 5) {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
        {films.map((film) => (
          <a key={film.id} href={`/films/${film.slug}`} className="group block">
            <Poster film={film} />
            <p className="mt-3 truncate text-sm group-hover:text-gold">
              {film.title}
            </p>
          </a>
        ))}
      </div>
    );
  }

  const slides: CoverflowSlide[] = withArt.map((film) => ({
    src: film.posterUrl!,
    alt: `${film.title} poster`,
    title: film.title,
    subtitle: [film.director, film.year].filter(Boolean).join(" · "),
    href: `/films/${film.slug}`,
    badge:
      film.reviewed && film.criticScore !== null ? (
        <SealMark score={film.criticScore} reviewCount={film.reviewCount} />
      ) : null,
  }));

  return <CoverflowCarousel slides={slides} label="Trending this week" />;
}
