import Image from "next/image";
import Link from "next/link";
import { SealMark } from "@/components/seal";

/**
 * One image, one sentence, one link.
 *
 * The homepage moves in a straight line — label, display heading, hairline
 * rule, a row of cards — five times over, which is a rhythm a reader stops
 * hearing after the second bar. This is the change of gear: full-bleed
 * artwork, the piece's own dek set as a pull quote rather than as a caption,
 * and nothing else competing for the eye.
 *
 * It borrows the magazine's oldest device: the spread you land on while
 * turning pages, which sells the piece without summarising it. So the copy
 * here is the argument in the writer's words, not a headline plus a "read
 * more" — the link is the whole band.
 */

export type VerdictArticle = {
  slug: string;
  title: string;
  dek: string;
  kicker: string;
  hero: string;
  heroAlt?: string;
};

export type VerdictFilm = {
  slug: string;
  title: string;
  year: number;
  criticScore: number | null;
  reviewed: boolean;
  reviewCount: number;
};

export function VerdictBand({
  article,
  film,
}: {
  article: VerdictArticle;
  film: VerdictFilm | null;
}) {
  const sealed = film?.reviewed && film.criticScore !== null;

  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <Image
        src={article.hero}
        alt={article.heroAlt ?? ""}
        fill
        sizes="100vw"
        className="-z-10 object-cover"
      />
      {/* Heavier than the masthead's scrim: that one sits under a headline
          with its own text-shadow, this sits under running prose. It also
          changes direction on a phone — see .verdict-scrim in globals.css. */}
      <div className="verdict-scrim absolute inset-0 -z-10" />

      <div className="mx-auto flex min-h-[26rem] max-w-[1400px] flex-col justify-end px-5 py-16 sm:px-8 sm:py-20 lg:min-h-[32rem]">
        <p className="label">{article.kicker}</p>

        <Link href={`/journal/${article.slug}`} className="group mt-6 block">
          <p className="max-w-4xl font-display text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.12] italic text-paper transition-colors group-hover:text-gold">
            “{article.dek}”
          </p>
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line-bright/40 pt-5">
          {film && (
            <Link
              href={`/films/${film.slug}`}
              className="flex items-center gap-3 text-sm text-muted transition-colors hover:text-paper"
            >
              <span>
                {film.title}{" "}
                <span className="text-faint tabular-nums">{film.year}</span>
              </span>
              {sealed && (
                <SealMark
                  score={film.criticScore!}
                  reviewCount={film.reviewCount}
                />
              )}
            </Link>
          )}

          <Link
            href={`/journal/${article.slug}`}
            className="label transition-colors hover:text-paper"
          >
            {/* Naming the piece is the better invitation, but a long
                headline set in caps at label size stops being a link and
                starts being a paragraph. */}
            {article.title.length > 38
              ? `Read the ${article.kicker.toLowerCase()} →`
              : `Read ${article.title} →`}
          </Link>
        </div>
      </div>
    </section>
  );
}
