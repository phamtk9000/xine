import Link from "next/link";
import { Shade } from "@/components/image-shade";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, KickerLabel, formatDate } from "@/components/ui";
import { FilmCard } from "@/components/film-card";
import { Reveal } from "@/components/reveal";
import { ReadingMarker } from "@/components/reading-marker";
import { HeroCarousel, type Slide } from "@/components/hero-carousel";
import { getArticle, listArticles } from "@/lib/journal";
import { listFilms } from "@/lib/films";
import { QuickRate } from "@/components/quick-rate";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
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

  const [related, all, sizes, viewer] = await Promise.all([
    article.films.length ? listFilms({ take: 200 }) : Promise.resolve([]),
    listArticles(),
    // Real dimensions per plate, so the carousel reserves the right box and
    // never letterboxes a portrait into a banner.
    Promise.all(article.images.map((image) => imageSize(image.src))),
    getCurrentUser(),
  ]);

  const slides: Slide[] = article.images.map((image, i) => ({
    ...image,
    width: sizes[i]?.width ?? 1600,
    height: sizes[i]?.height ?? 900,
  }));

  const linkedFilms = related.filter((f) => article.films.includes(f.slug));
  const more = all.filter((a) => a.slug !== article.slug).slice(0, 3);

  // The reader's own scores for the films the piece is about, and the lists
  // those films sit in. Both are edges that already exist in the data and
  // were simply never drawn: an essay about a film is a natural place to
  // rate it, and the lists are the argument the essay is joining.
  const [mine, inLists] = await Promise.all([
    viewer && linkedFilms.length
      ? db.rating.findMany({
          where: { userId: viewer.id, filmId: { in: linkedFilms.map((f) => f.id) } },
          select: { filmId: true, overall: true },
        })
      : Promise.resolve([]),
    linkedFilms.length
      ? db.filmList.findMany({
          where: { entries: { some: { filmId: { in: linkedFilms.map((f) => f.id) } } } },
          orderBy: { position: "asc" },
          take: 6,
          select: { slug: true, title: true, _count: { select: { entries: true } } },
        })
      : Promise.resolve([]),
  ]);

  const myScore = new Map(mine.map((row) => [row.filmId, row.overall]));

  return (
    <article
      data-style={article.style}
      style={
        article.accent
          ? ({ "--art-accent": article.accent } as React.CSSProperties)
          : undefined
      }
    >
      {/* The page's ambient wash comes from the accent this piece declared
          in its frontmatter — a colour a person chose, which beats anything
          sampling the artwork could infer. */}
      {article.accent && <Shade color={article.accent} />}

      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <div className="art-lede max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <KickerLabel
                kicker={article.kicker}
                href={`/journal?kicker=${encodeURIComponent(article.kicker)}`}
              />
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

      {slides.length > 0 && <HeroCarousel slides={slides} />}

      <Container className="py-14 sm:py-20">
        <div
          id="article-body"
          className="prose-xine prose-columns mx-auto max-w-[100rem]"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />
        <Reveal selector="#article-body" />
        <ReadingMarker selector="#article-body" />

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
                  <dd className="text-right font-sans text-sm text-gold tabular-nums">
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
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Rate one here and it goes straight into your taste — the reading
              on your profile, and what turns up on What to Watch.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              {linkedFilms.map((film) => (
                <div key={film.id}>
                  <FilmCard film={film} />
                  <div className="mt-2">
                    <QuickRate
                      filmId={film.id}
                      slug={film.slug}
                      mine={myScore.get(film.id) ?? null}
                      signedIn={!!viewer}
                    />
                  </div>
                </div>
              ))}
            </div>

            {inLists.length > 0 && (
              <div className="mt-10 border-t border-line pt-6">
                <p className="label">Arguments these films are already in</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {inLists.map((list) => (
                    <Link
                      key={list.slug}
                      href={`/lists/${list.slug}`}
                      className="label rounded-full border border-line px-3 py-1.5 !text-[0.5625rem] transition-colors hover:border-line-bright hover:!text-paper"
                    >
                      {list.title}
                      <span className="readout ml-2 text-faint">
                        {list._count.entries}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
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
                  <KickerLabel kicker={a.kicker} />
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
