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
  // The full wheel, not the cold quarter it was narrowed to. A plate stands
  // in for artwork, and artwork is the one thing on this site allowed to be
  // any colour it likes — a wall of plates in nine shades of blue looked
  // like a system diagram of films rather than a shelf of them.
  const hue = h % 360;
  // Chroma up, lightness still low: the plate is a ground for type, so it
  // has to hold white text at 12px. The gradient falls to a much darker,
  // hue-shifted corner, which is what keeps a saturated rectangle readable.
  return {
    from: `oklch(0.42 0.16 ${hue})`,
    to: `oklch(0.16 0.07 ${(hue + 45) % 360})`,
    rule: `oklch(0.78 0.19 ${hue})`,
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
      <div className="relative aspect-2/3 overflow-hidden rounded-[3px] bg-ink-raised">
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
      className="relative flex aspect-2/3 flex-col justify-between overflow-hidden rounded-[3px] p-4"
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

/**
 * Poster at row height — a picker result, a search hit, a line in a list
 * being built.
 *
 * Separate from Poster rather than a size prop on it, because the type plate
 * does not survive the shrink: it is a designed object with 16px of padding
 * and a clamped display face, and at 40px wide that resolves to a smear.
 * Here the plate keeps only what reads at that size — its colour, and the
 * initial — so a film with no art is still a distinct, stable mark next to
 * its title rather than an empty grey box.
 */
export function PosterThumb({
  film,
  className = "",
}: {
  film: {
    slug: string;
    title: string;
    posterUrl?: string | null;
  };
  className?: string;
}) {
  if (film.posterUrl) {
    return (
      <div
        className={`relative aspect-2/3 overflow-hidden rounded-sm bg-ink-raised ${className}`}
      >
        <Image
          src={film.posterUrl}
          alt=""
          fill
          sizes="48px"
          className="object-cover"
        />
      </div>
    );
  }

  const { from, to } = plateColors(film.slug);

  return (
    <div
      className={`flex aspect-2/3 items-center justify-center overflow-hidden rounded-sm ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
      aria-hidden
    >
      <span className="font-display text-sm leading-none text-paper/70">
        {film.title.slice(0, 1)}
      </span>
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
