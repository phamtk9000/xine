import Image from "next/image";
import Link from "next/link";
import type { ArticleMeta } from "@/lib/journal";
import { formatDate } from "@/components/ui";

/**
 * The front-page editorial listing, in the register a text magazine's own
 * front page uses: headline, one-line dek, byline, a bracketed section tag
 * standing in for a coloured pill. No poster-sized art — a small fixed
 * thumbnail at most — because on a page that is mostly headlines, density
 * is the thing doing the work a hero image would otherwise do.
 */

export function IndexList({ articles }: { articles: ArticleMeta[] }) {
  return (
    <ol className="index-list">
      {articles.map((article, i) => (
        <li key={article.slug} className="index-row">
          {article.hero ? (
            <Link
              href={`/journal/${article.slug}`}
              className="index-row-plate"
              tabIndex={-1}
              aria-hidden="true"
            >
              <Image
                src={article.hero}
                alt=""
                fill
                sizes="104px"
                priority={i === 0}
                className={
                  article.heroLayout === "plate"
                    ? "object-contain p-1"
                    : "object-cover"
                }
              />
            </Link>
          ) : (
            <span className="index-row-plate" />
          )}

          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-faint">
              <Link
                href={`/journal?kicker=${encodeURIComponent(article.kicker)}`}
                className="index-kicker text-muted hover:text-paper"
              >
                {article.kicker}
              </Link>
              <span>{formatDate(new Date(article.date))}</span>
            </p>

            <h3 className="mt-2">
              <Link
                href={`/journal/${article.slug}`}
                className="font-display text-2xl leading-[1.05] tracking-tight transition-colors hover:text-gold sm:text-3xl"
              >
                {article.title}
              </Link>
            </h3>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {article.dek}
            </p>

            <p className="mt-3 font-mono text-[0.625rem] tracking-[0.16em] uppercase text-faint">
              {article.author}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
