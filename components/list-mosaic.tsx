import { plateColors } from "@/components/poster";

/**
 * Four posters in a square, the way every music service draws a playlist.
 *
 * The shape is doing an argument's work. A row of spines says "here are some
 * films"; one square object with a title under it says "somebody made this",
 * which is what a list — and a collection of lists — actually is. Readers
 * already know the idiom from elsewhere, so nothing has to be explained.
 *
 * Posters are cropped square on purpose. A 2:3 poster squeezed into a
 * quarter tile loses its top and bottom, and that is fine here: the tile is
 * a texture, not a poster, and the title beneath is what identifies the
 * thing. Anything short of four films fills the gaps with its own plate
 * colour rather than leaving holes.
 */

export type MosaicFilm = {
  slug: string;
  title: string;
  posterUrl: string | null;
};

export function Mosaic({
  films,
  className = "",
}: {
  films: MosaicFilm[];
  /** Sizing only — the square and the grid are fixed. */
  className?: string;
}) {
  return (
    <div
      className={`grid aspect-square grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line ${className}`}
    >
      {Array.from({ length: 4 }, (_, i) => films[i]).map((film, i) =>
        film ? (
          <span
            key={`${film.slug}-${i}`}
            className="relative block overflow-hidden"
          >
            <Tile film={film} />
          </span>
        ) : (
          <span key={`empty-${i}`} className="block bg-ink-raised" />
        ),
      )}
    </div>
  );
}

function Tile({ film }: { film: MosaicFilm }) {
  if (!film.posterUrl) {
    const { from, to } = plateColors(film.slug);
    return (
      <span
        className="block h-full w-full"
        style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={film.posterUrl}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
    />
  );
}
