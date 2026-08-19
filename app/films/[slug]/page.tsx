import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Backdrop, Poster } from "@/components/poster";
import { AxisBreakdown, AxisSpark, ScoreDial } from "@/components/score";
import { SealBadge } from "@/components/seal";
import { RatingForm } from "@/components/rating-form";
import { ReviewForm } from "@/components/review-form";
import { Container, Tag, formatDate, formatRuntime } from "@/components/ui";
import { aggregateRatings, getFilmBySlug } from "@/lib/films";
import { articlesForFilm } from "@/lib/journal";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { AXES } from "@/lib/scores";

export async function generateMetadata({
  params,
}: PageProps<"/films/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const film = await db.film.findUnique({ where: { slug } });
  if (!film) return {};
  return {
    title: `${film.title} (${film.year})`,
    description: film.synopsis,
  };
}

export default async function FilmPage({ params }: PageProps<"/films/[slug]">) {
  const { slug } = await params;
  const [film, user] = await Promise.all([
    getFilmBySlug(slug),
    getCurrentUser(),
  ]);
  if (!film) notFound();

  const aggregate = aggregateRatings(film.ratings);
  const articles = await articlesForFilm(slug);

  // The badge's quote favours a piece actually filed as a Review; an Essay
  // or Craft piece that happens to mention the film isn't the verdict.
  const sealQuote =
    (articles.find((a) => a.kicker === "Review") ?? articles[0])?.dek ?? null;
  const sealed = film.reviewed && film.criticScore !== null;

  const myRating = user
    ? (film.ratings.find((r) => r.userId === user.id) ?? null)
    : null;
  const myReview = user
    ? (film.reviews.find((r) => r.userId === user.id) ?? null)
    : null;
  const onWatchlist = user
    ? (await db.watchlistItem.count({
        where: { userId: user.id, filmId: film.id },
      })) > 0
    : false;

  const genres = fromCsv(film.genres);
  const cast = fromCsv(film.cast);
  const runtime = formatRuntime(film.runtime);

  return (
    <article>
      <div className="relative">
        <Backdrop film={film} className="absolute inset-0 h-full w-full" />
        <Container className="relative py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
            <div className="w-40 sm:w-52 lg:w-full">
              <Poster film={film} sizes="240px" priority />
            </div>

            <div>
              <p className="label">
                {film.director} · {film.year}
                {film.country ? ` · ${film.country}` : ""}
              </p>
              <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
                {film.title}
              </h1>
              {film.originalTitle && (
                <p className="mt-2 font-display text-2xl text-muted italic">
                  {film.originalTitle}
                </p>
              )}

              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
                {film.synopsis}
              </p>

              {/* Provenance. A TMDB overview is marketing copy, and passing it
                  off as editorial would undermine the reviewed films. */}
              {!film.reviewed && (
                <p className="mt-3 font-mono text-[0.625rem] tracking-[0.16em] uppercase text-faint">
                  Synopsis from TMDB · not yet reviewed by xine
                </p>
              )}

              <div className="mt-7 flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <Tag
                    key={genre}
                    href={`/films?genre=${encodeURIComponent(genre)}`}
                  >
                    {genre}
                  </Tag>
                ))}
                {runtime && <Tag>{runtime}</Tag>}
                {film.language && <Tag>{film.language}</Tag>}
              </div>

              {sealed && (
                <div className="mt-9 max-w-md">
                  <SealBadge
                    score={film.criticScore!}
                    quote={sealQuote}
                    reviewCount={articles.length}
                    audienceScore={aggregate.community}
                  />
                </div>
              )}

              <div className="mt-9 flex flex-wrap gap-x-12 gap-y-6 border-t border-line pt-7">
                {!sealed && (
                  <ScoreDial
                    label="TMDB score"
                    value={film.tmdbScore}
                    size="md"
                  />
                )}
                <ScoreDial
                  label={`Community · ${aggregate.count} rating${aggregate.count === 1 ? "" : "s"}`}
                  value={aggregate.community}
                  size="md"
                  accent
                />
                <ScoreDial
                  label="Your rating"
                  value={myRating?.overall ?? null}
                  size="md"
                />
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-14">
        <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
          <div className="order-2 lg:order-1">
            <section>
              <h2 className="label border-b border-line pb-3">
                Community breakdown
              </h2>
              {aggregate.count === 0 ? (
                <p className="mt-5 text-sm text-muted">
                  Nobody has rated this yet. Be the first.
                </p>
              ) : (
                <div className="mt-6 max-w-xl">
                  <AxisBreakdown scores={aggregate.axes} />
                  <p className="mt-5 text-xs text-faint">
                    Averaged across {aggregate.count} rating
                    {aggregate.count === 1 ? "" : "s"}. Axes only count the
                    people who filled them in.
                  </p>
                </div>
              )}
            </section>

            <section className="mt-14">
              <h2 className="label border-b border-line pb-3">Credits</h2>
              <dl className="mt-5 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                <Credit label="Director" value={film.director} />
                <Credit label="Cinematography" value={film.cinematographer} />
                <Credit label="Music" value={film.composer} />
                <Credit label="Country" value={film.country} />
                {cast.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="label">Cast</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-paper">
                      {cast.join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {articles.length > 0 && (
              <section className="mt-14">
                <h2 className="label border-b border-line pb-3">
                  In the Journal
                </h2>
                <div className="mt-5 space-y-5">
                  {articles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/journal/${article.slug}`}
                      className="group block"
                    >
                      <p className="label !text-gold">{article.kicker}</p>
                      <p className="mt-1.5 font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                        {article.title}
                      </p>
                      <p className="mt-1.5 text-sm text-muted">{article.dek}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-14">
              <h2 className="label border-b border-line pb-3">
                Reviews · {film.reviews.length}
              </h2>

              {user && (
                <div className="mt-6">
                  <ReviewForm
                    filmId={film.id}
                    slug={film.slug}
                    existing={myReview}
                  />
                </div>
              )}

              <div className="mt-8 space-y-10">
                {film.reviews.length === 0 && (
                  <p className="text-sm text-muted">
                    No reviews yet. Write the first one.
                  </p>
                )}
                {film.reviews.map((review) => {
                  const rating = film.ratings.find(
                    (r) => r.userId === review.userId,
                  );
                  return (
                    <article
                      key={review.id}
                      className="border-b border-line pb-10 last:border-0"
                    >
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/community/${review.user.username}`}
                          className="text-sm font-medium transition-colors hover:text-gold"
                        >
                          {review.user.displayName}
                        </Link>
                        {rating && (
                          <span className="font-mono text-xs text-gold tabular-nums">
                            {rating.overall.toFixed(1)}
                          </span>
                        )}
                        {rating && <AxisSpark scores={rating} />}
                        <span className="ml-auto text-xs text-faint">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      {review.spoilers && (
                        <p className="mt-3 font-mono text-[0.625rem] tracking-[0.16em] uppercase text-accent">
                          Contains spoilers
                        </p>
                      )}
                      <div className="mt-4 space-y-4">
                        {review.body.split("\n\n").map((para, i) => (
                          <p
                            key={i}
                            className="text-[0.9375rem] leading-relaxed text-muted"
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="order-1 space-y-6 lg:order-2">
            <RatingForm
              filmId={film.id}
              slug={film.slug}
              existing={myRating}
              signedIn={!!user}
              onWatchlist={onWatchlist}
            />

            {myRating && (
              <div className="rounded-xl border border-line p-6">
                <p className="label">Your breakdown</p>
                <div className="mt-5">
                  <AxisBreakdown scores={myRating} compact />
                </div>
                {AXES.every(({ key }) => myRating[key] === null) && (
                  <p className="mt-4 text-xs text-faint">
                    You rated this overall only. Open the breakdown to say why.
                  </p>
                )}
              </div>
            )}

            {film.listEntries.length > 0 && (
              <div className="rounded-xl border border-line p-6">
                <p className="label">Appears in</p>
                <ul className="mt-4 space-y-3">
                  {film.listEntries.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={`/lists/${entry.list.slug}`}
                        className="text-sm text-muted transition-colors hover:text-paper"
                      >
                        {entry.list.title}
                        {entry.list.editorial && (
                          <span className="ml-2 font-mono text-[0.625rem] tracking-[0.16em] uppercase text-gold">
                            Editorial
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </Container>
    </article>
  );
}

function Credit({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 text-sm text-paper">{value}</dd>
    </div>
  );
}
