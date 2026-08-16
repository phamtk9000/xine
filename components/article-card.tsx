import Image from "next/image";
import Link from "next/link";
import type { ArticleMeta } from "@/lib/journal";
import { formatDate } from "@/components/ui";

export function ArticleCard({
  article,
  size = "md",
  priority = false,
}: {
  article: ArticleMeta;
  size?: "sm" | "md" | "lg";
  priority?: boolean;
}) {
  const titleSize =
    size === "lg"
      ? "text-4xl sm:text-6xl"
      : size === "sm"
        ? "text-xl"
        : "text-3xl";

  return (
    <Link href={`/journal/${article.slug}`} className="group block">
      {article.hero && (
        <div
          className={`relative mb-5 overflow-hidden rounded-md bg-ink-raised ${
            size === "lg" ? "aspect-16/9" : "aspect-3/2"
          }`}
        >
          <Image
            src={article.hero}
            alt={article.heroAlt ?? ""}
            fill
            sizes={size === "lg" ? "100vw" : "(max-width: 768px) 100vw, 33vw"}
            priority={priority}
            className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="label !text-gold">{article.kicker}</span>
        <span className="text-xs text-faint">
          {article.readingTime} min read
        </span>
        {article.score !== undefined && (
          <span className="ml-auto font-mono text-xs tabular-nums text-gold">
            {article.score.toFixed(1)}
          </span>
        )}
      </div>

      <h3
        className={`mt-2.5 font-display leading-[1.02] tracking-tight transition-colors group-hover:text-gold ${titleSize}`}
      >
        {article.title}
      </h3>

      {size !== "sm" && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {article.dek}
        </p>
      )}

      <p className="mt-3 font-mono text-[0.625rem] tracking-[0.16em] uppercase text-faint">
        {article.author} · {formatDate(new Date(article.date))}
      </p>
    </Link>
  );
}
