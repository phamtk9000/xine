import Link from "next/link";
import { CountUp } from "@/components/count-up";

/**
 * The catalogue, stated rather than shown.
 *
 * The homepage was five poster rows in a row: trending, lists, new releases,
 * plus artwork in the journal block and the masthead. Each one is defensible
 * on its own and together they gave the page a single texture from top to
 * bottom, so nothing on it could be *emphatic* — every module was already
 * shouting at the same volume.
 *
 * This is the quiet one. No images at all: four figures set large, on the
 * sunk ground, doing what a poster row cannot — telling you how big the
 * thing you are browsing actually is.
 */

export type CatalogueFigures = {
  titles: number;
  films: number;
  series: number;
  reviewed: number;
  countries: number;
  earliest: number | null;
  latest: number | null;
};

export function CatalogueNumbers({ stats }: { stats: CatalogueFigures }) {
  const span =
    stats.earliest && stats.latest ? stats.latest - stats.earliest : null;

  const figures: { value: number; label: string; note: string }[] = [
    {
      value: stats.titles,
      label: "Titles",
      note: `${stats.films.toLocaleString()} films, ${stats.series.toLocaleString()} series — rated the same way`,
    },
    {
      value: stats.countries,
      label: "Countries",
      note: "where the work was made, not where it was financed",
    },
    ...(span
      ? [
          {
            value: span,
            label: "Years covered",
            note: `${stats.earliest} to ${stats.latest}, and the gap is the argument`,
          },
        ]
      : []),
    {
      value: stats.reviewed,
      label: "Written about",
      note: "a person set the score and wrote the synopsis",
    },
  ];

  return (
    <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.label} className="border-t border-line pt-5">
          <dd className="font-display text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.9] tabular-nums text-paper">
            <CountUp value={figure.value} />
          </dd>
          <dt className="label mt-3">{figure.label}</dt>
          <p className="mt-2 max-w-[22ch] text-xs leading-relaxed text-faint">
            {figure.note}
          </p>
        </div>
      ))}
    </dl>
  );
}

/** The line under the figures — one link out, no poster. */
export function CatalogueNumbersFooter() {
  return (
    <p className="mt-12 max-w-2xl text-base leading-relaxed text-muted">
      Every title here is open to a rating on five axes plus an overall, and
      the breakdown is optional.{" "}
      <Link
        href="/films"
        className="text-gold underline underline-offset-4 transition-colors hover:text-paper"
      >
        Browse the catalogue
      </Link>{" "}
      or{" "}
      <Link
        href="/films/find"
        className="text-gold underline underline-offset-4 transition-colors hover:text-paper"
      >
        describe what you are in the mood for
      </Link>
      .
    </p>
  );
}
