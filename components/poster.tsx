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

/**
 * The ambient wash behind a film page — its own artwork, out of focus.
 *
 * Blurred rather than sharp, and that is the whole point: a hero that prints
 * the banner cleanly behind the title is competing with the poster three
 * inches to its left, and the two of them fight. Thrown far out of focus the
 * still stops being a picture and becomes light — the page for There Will Be
 * Blood glows oil-fire orange, the one for Burning glows dusk blue, and
 * neither one asks to be looked at.
 *
 * The blur is soft focus, not obliteration. Sixty-four pixels of it turned
 * every backdrop into an abstract wash with no image left in it; eighteen
 * keeps the frame readable as a place — you can see it is a derrick, a lawn,
 * a corridor — while still sitting behind the type rather than competing
 * with it.
 *
 * Falls back to the poster, because roughly five thousand films in the
 * catalogue have poster art and no banner, and a film page with no light at
 * all reads as a page that failed to load. That fallback keeps the heavy
 * blur, and the difference is not fussiness: a banner is a frame from the
 * film and survives being looked at, whereas a poster is a designed object
 * with type and billing on it. Stretch one across a wide hero at soft focus
 * and what shows through is smeared lettering — obviously a poster, obviously
 * in the wrong place. At forty pixels it goes back to being colour.
 */
export function Backdrop({
  film,
  className = "",
}: {
  film: {
    slug: string;
    title: string;
    backdropUrl?: string | null;
    posterUrl?: string | null;
  };
  className?: string;
}) {
  const source = film.backdropUrl ?? film.posterUrl ?? null;
  const wide = Boolean(film.backdropUrl);

  if (source) {
    return (
      <div className={`overflow-hidden ${className}`} aria-hidden>
        <Image
          src={source}
          alt=""
          fill
          sizes="100vw"
          priority
          // Scaled past the edges: a blur samples beyond its own bounds, so an
          // unscaled image feathers to transparent at all four sides and the
          // wash ends in a visible grey frame.
          className={`object-cover ${
            wide ? "scale-110 opacity-85 blur-[18px]" : "scale-125 opacity-70 blur-[40px]"
          }`}
        />
        {/* Two veils. The vertical one lands the wash on the page background
            so the hero has no seam; the horizontal one darkens the side the
            text sits on, which is what keeps 12px labels legible over a
            bright frame. */}
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/40 to-ink/10" />
        <div className="absolute inset-0 bg-linear-to-r from-ink/75 via-ink/20 to-ink/10" />
      </div>
    );
  }

  const { from, to } = plateColors(film.slug);
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/50 to-transparent" />
    </div>
  );
}
