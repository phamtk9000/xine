import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, formatDate } from "@/components/ui";
import { FilmCard } from "@/components/film-card";
import { getArticle, listArticles } from "@/lib/journal";
import { listFilms } from "@/lib/films";
import { imageSize } from "@/lib/image-size";

export async function generateStaticParams() {
  const articles = await listArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/journal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.dek,
    openGraph: {
      title: article.title,
      description: article.dek,
      images: article.hero ? [article.hero] : undefined,
    },
  };
}

export default async function ArticlePage({
  params,
}: PageProps<"/journal/[slug]">) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const [related, all, heroSize] = await Promise.all([
    article.films.length ? listFilms({ take: 200 }) : Promise.resolve([]),
    listArticles(),
    article.hero && article.heroLayout === "plate"
      ? imageSize(article.hero)
      : Promise.resolve(null),
  ]);

  const linkedFilms = related.filter((f) => article.films.includes(f.slug));
  const more = all.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <article
      data-style={article.style}
      style={
        article.accent
          ? ({ "--art-accent": article.accent } as React.CSSProperties)
          : undefined
      }
    >
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/journal?kicker=${encodeURIComponent(article.kicker)}`}
                className="label !text-gold"
              >
                {article.kicker}
              </Link>
              <span className="text-xs text-faint">
                {article.readingTime} min read
              </span>
            </div>

            <h1 className="mt-5 font-display text-4xl leading-[0.98] tracking-tight sm:text-6xl">
              {article.title}
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-muted">
              {article.dek}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-6">
              <p className="label">{article.author}</p>
              <p className="text-xs text-faint">
                {formatDate(new Date(article.date))}
              </p>
              {article.score !== undefined && (
                <p className="ml-auto font-display text-4xl leading-none text-gold tabular-nums">
                  {article.score.toFixed(1)}
                  <span className="ml-1 font-sans text-xs text-faint">/10</span>
                </p>
              )}
            </div>
          </div>
        </Container>
      </header>

      {article.hero &&
        (article.heroLayout === "plate" ? (
          // Key art is shown whole, at its own aspect ratio — cropping a 2:3
          // poster into a letterbox band cuts the title block off.
          <div className="bg-ink-sunk py-12">
            <Container>
              <Image
                src={article.hero}
                alt={article.heroAlt ?? ""}
                width={heroSize?.width ?? 1200}
                height={heroSize?.height ?? 1600}
                sizes="(max-width: 768px) 100vw, 40rem"
                priority
                className="mx-auto h-auto max-h-[82vh] w-auto max-w-full rounded-sm"
              />
            </Container>
          </div>
        ) : (
          <div className="relative aspect-16/9 max-h-[70vh] w-full overflow-hidden bg-ink-raised sm:aspect-21/9">
            <Image
              src={article.hero}
              alt={article.heroAlt ?? ""}
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
          </div>
        ))}

      <Container className="py-14 sm:py-20">
        <div
          className="prose-xine prose-columns mx-auto max-w-[100rem]"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />

        {article.verdict && article.verdict.length > 0 && (
          <section className="mt-16 max-w-5xl">
            <p className="label">The breakdown</p>
            <dl className="mt-5 border-t border-line-bright">
              {article.verdict.map((row) => (
                <div
                  key={row.department}
                  className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-line py-5"
                >
                  <dt className="font-display text-2xl leading-tight">
                    {row.department}
                  </dt>
                  <dd className="text-right font-mono text-sm text-gold tabular-nums">
                    {row.rating}
                  </dd>
                  <dd className="col-span-2 text-sm leading-relaxed text-muted">
                    {row.note}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {linkedFilms.length > 0 && (
          <section className="mt-16 max-w-5xl">
            <p className="label">Films in this piece</p>
            <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
              {linkedFilms.map((film) => (
                <FilmCard key={film.id} film={film} />
              ))}
            </div>
          </section>
        )}
      </Container>

      {more.length > 0 && (
        <section className="border-t border-line bg-ink-sunk py-14">
          <Container>
            <p className="label">Keep reading</p>
            <div className="mt-8 grid gap-10 md:grid-cols-3">
              {more.map((a) => (
                <Link
                  key={a.slug}
                  href={`/journal/${a.slug}`}
                  className="group block"
                >
                  <p className="label !text-gold">{a.kicker}</p>
                  <p className="mt-2 font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                    {a.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {a.dek}
                  </p>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}
    </article>
  );
}
