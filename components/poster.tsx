import Image from "next/image";

/**
 * No poster art ships with xine. Until a TMDB key is configured, films are
 * drawn as typographic plates — deterministic from the slug, so a given film
 * always looks the same and a wall of them still reads as a designed grid
 * rather than a row of grey boxes.
 */

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function plateColors(slug: string) {
  const h = hash(slug);
  const hue = h % 360;
  // Deliberately low chroma and lightness: the plate is a ground for type,
  // not an image, and a grid of saturated rectangles would be unreadable.
  return {
    from: `oklch(0.28 0.055 ${hue})`,
    to: `oklch(0.14 0.03 ${(hue + 40) % 360})`,
    rule: `oklch(0.55 0.09 ${hue})`,
  };
}

export function Poster({
  film,
  sizes = "(max-width: 640px) 45vw, 220px",
  priority = false,
}: {
  film: {
    slug: string;
    title: string;
    year: number;
    director: string;
    posterUrl?: string | null;
  };
  sizes?: string;
  priority?: boolean;
}) {
  if (film.posterUrl) {
    return (
      <div className="relative aspect-2/3 overflow-hidden rounded-md bg-ink-raised">
        <Image
          src={film.posterUrl}
          alt={`${film.title} poster`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
    );
  }

  const { from, to, rule } = plateColors(film.slug);

  return (
    <div
      className="relative flex aspect-2/3 flex-col justify-between overflow-hidden rounded-md p-4"
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
      role="img"
      aria-label={`${film.title}, ${film.year}, directed by ${film.director}`}
    >
      <div
        className="h-px w-full opacity-70"
        style={{ background: rule }}
        aria-hidden
      />
      <p className="font-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-[0.98] text-paper">
        {film.title}
      </p>
      <div aria-hidden>
        <div
          className="mb-3 h-px w-8 opacity-70"
          style={{ background: rule }}
        />
        <p className="font-sans text-[0.625rem] uppercase tracking-[0.16em] text-paper/55">
          {film.director}
        </p>
        <p className="font-sans text-[0.625rem] tracking-[0.16em] text-paper/40">
          {film.year}
        </p>
      </div>
    </div>
  );
}

/** Wide variant for film pages and features. */
export function Backdrop({
  film,
  className = "",
}: {
  film: { slug: string; title: string; backdropUrl?: string | null };
  className?: string;
}) {
  if (film.backdropUrl) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={film.backdropUrl}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/40 to-transparent" />
      </div>
    );
  }

  const { from, to } = plateColors(film.slug);
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/50 to-transparent" />
    </div>
  );
}
