import Link from "next/link";
import type { Metadata } from "next";
import { AxisSpark } from "@/components/score";
import { Container, PageHeader, formatDate } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Recent reviews",
  description: "The newest community reviews across the catalogue.",
};

export default async function ReviewsPage() {
  const reviews = await db.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      user: { select: { username: true, displayName: true } },
      film: {
        select: { slug: true, title: true, year: true, director: true },
      },
    },
  });

  const ratings = await db.rating.findMany({
    where: {
      OR: reviews.map((r) => ({ userId: r.userId, filmId: r.filmId })),
    },
  });
  const ratingFor = new Map(
    ratings.map((r) => [`${r.userId}:${r.filmId}`, r]),
  );

  return (
    <>
      <PageHeader
        label="Community"
        title="Recent reviews."
        lede="Written by members, in full, with the rating that went with them."
      />

      <Container className="py-14">
        <div className="max-w-3xl space-y-12">
          {reviews.map((review) => {
            const rating = ratingFor.get(`${review.userId}:${review.filmId}`);
            return (
              <article
                key={review.id}
                className="border-b border-line pb-12 last:border-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/films/${review.film.slug}`}
                    className="font-display text-3xl leading-tight transition-colors hover:text-gold"
                  >
                    {review.film.title}
                  </Link>
                  <span className="text-sm text-faint">
                    {review.film.director} · {review.film.year}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href={`/community/${review.user.username}`}
                    className="text-sm transition-colors hover:text-gold"
                  >
                    {review.user.displayName}
                  </Link>
                  {rating && (
                    <>
                      <span className="font-sans text-xs text-gold tabular-nums">
                        {rating.overall.toFixed(1)}
                      </span>
                      <AxisSpark scores={rating} />
                    </>
                  )}
                  <span className="ml-auto text-xs text-faint">
                    {formatDate(review.createdAt)}
                  </span>
                </div>

                {review.spoilers && (
                  <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-accent">
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
      </Container>
    </>
  );
}
