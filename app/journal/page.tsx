import Link from "next/link";
import type { Metadata } from "next";
import { ArticleCard } from "@/components/article-card";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { listArticles } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal",
  description:
    "Reviews, essays, craft analysis and interviews. The editorial side of xine.",
};

export default async function JournalPage({
  searchParams,
}: PageProps<"/journal">) {
  const params = await searchParams;
  const kicker = typeof params.kicker === "string" ? params.kicker : undefined;

  const all = await listArticles();
  const kickers = [...new Set(all.map((a) => a.kicker))].sort();
  const articles = kicker ? all.filter((a) => a.kicker === kicker) : all;

  // The lead slot is a big image card, so it goes to the newest featured piece
  // rather than simply the newest — an article with no artwork looks starved
  // at that size. Falls back to the newest when nothing is featured.
  const leadIndex = Math.max(
    articles.findIndex((a) => a.featured),
    0,
  );
  const lead = articles[leadIndex];
  const rest = articles.filter((_, i) => i !== leadIndex);

  return (
    <>
      <PageHeader
        label="Journal"
        title="Writing about films, and about the people who make them."
        lede="Reviews, essays, craft breakdowns and festival reporting. Long enough to have an argument in."
      />

      <Container className="py-12">
        <nav className="mb-12 flex flex-wrap gap-2" aria-label="Categories">
          <Link
            href="/journal"
            className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
              !kicker
                ? "border-paper text-paper"
                : "border-line text-muted hover:border-line-bright hover:text-paper"
            }`}
          >
            Everything
          </Link>
          {kickers.map((k) => (
            <Link
              key={k}
              href={`/journal?kicker=${encodeURIComponent(k)}`}
              className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                kicker === k
                  ? "border-paper text-paper"
                  : "border-line text-muted hover:border-line-bright hover:text-paper"
              }`}
            >
              {k}
            </Link>
          ))}
        </nav>

        {articles.length === 0 ? (
          <EmptyState
            title="Nothing filed here yet"
            body="No articles in this category. Try another, or read everything."
          />
        ) : (
          <>
            <div className="border-b border-line pb-14">
              <ArticleCard article={lead} size="lg" priority />
            </div>

            {rest.length > 0 && (
              <div className="grid gap-x-8 gap-y-14 pt-14 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((article) => (
                  <ArticleCard key={article.slug} article={article} />
                ))}
              </div>
            )}
          </>
        )}
      </Container>
    </>
  );
}
