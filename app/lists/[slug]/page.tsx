import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FilmRow } from "@/components/film-card";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { findShelf } from "@/lib/collections";
import { editorialCounts } from "@/lib/films";
import { getCurrentUser } from "@/lib/session";
import { removeFromList } from "@/app/actions/lists";
import { EntryNote } from "@/components/entry-note";
import { fromCsv } from "@/lib/serialize";
import { round1 } from "@/lib/scores";

export async function generateMetadata({
  params,
}: PageProps<"/lists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const list = await db.filmList.findUnique({ where: { slug } });
  if (!list) return {};
  return { title: list.title, description: list.description };
}

export default async function ListPage({ params }: PageProps<"/lists/[slug]">) {
  const { slug } = await params;
  const [list, user, reviewCounts] = await Promise.all([
    db.filmList.findUnique({
      where: { slug },
      include: {
        owner: { select: { username: true, displayName: true } },
        entries: {
          orderBy: { position: "asc" },
          include: { film: { include: { ratings: true } } },
        },
      },
    }),
    getCurrentUser(),
    editorialCounts(),
  ]);

  if (!list) notFound();
  const mine = !!user && list.ownerId === user.id;

  // This reader's own ratings for the films on the list, for the one-tap
  // scale under each row.
  const myRatings = user
    ? new Map(
        (
          await db.rating.findMany({
            where: {
              userId: user.id,
              filmId: { in: list.entries.map((entry) => entry.filmId) },
            },
            select: { filmId: true, overall: true },
          })
        ).map((row) => [row.filmId, row.overall]),
      )
    : new Map<string, number>();
  // Which shelf this list sits on, if any — the way back up a level.
  const shelf = findShelf(list.collection);

  const films = list.entries.map((entry) => {
    const ratings = entry.film.ratings;
    const community =
      ratings.length === 0
        ? null
        : round1(ratings.reduce((s, r) => s + r.overall, 0) / ratings.length);

    return {
      entryId: entry.id,
      note: entry.note,
      film: {
        id: entry.film.id,
        slug: entry.film.slug,
        title: entry.film.title,
        year: entry.film.year,
        director: entry.film.director,
        runtime: entry.film.runtime,
        country: entry.film.country,
        genres: fromCsv(entry.film.genres),
        posterUrl: entry.film.posterUrl,
        criticScore: entry.film.criticScore,
        communityScore: community,
        ratingCount: ratings.length,
        reviewed: entry.film.reviewed,
        tmdbScore: entry.film.tmdbScore,
        reviewCount: reviewCounts.get(entry.film.slug) ?? 0,
      },
    };
  });

  return (
    <>
      <PageHeader
        label={
          shelf
            ? shelf.name
            : list.editorial
              ? "Editorial list"
              : list.owner
                ? `List by ${list.owner.displayName}`
                : "List"
        }
        title={list.title}
        lede={list.description}
      />

      <Container className="py-12">
        <div className="max-w-4xl">
          <p className="label border-b border-line pb-3">
            {films.length} film{films.length === 1 ? "" : "s"}
          </p>

          <div className="mt-2">
            {films.map((entry, i) => (
              <div key={entry.entryId} className="relative">
                <FilmRow
                  film={entry.film}
                  position={i + 1}
                  note={entry.note}
                  noteSlot={
                    mine ? (
                      <EntryNote entryId={entry.entryId} note={entry.note} />
                    ) : undefined
                  }
                  viewer={{ signedIn: !!user, ratings: myRatings }}
                />
                {mine && (
                  <form
                    action={removeFromList}
                    className="absolute top-5 right-0"
                  >
                    <input type="hidden" name="entryId" value={entry.entryId} />
                    <button
                      type="submit"
                      className="label transition-colors hover:text-accent"
                      aria-label={`Remove ${entry.film.title} from this list`}
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {films.length === 0 && (
            <p className="py-12 text-sm text-muted">
              This list is empty. Add films from any film page.
            </p>
          )}

          {shelf && (
            <p className="mt-10 text-sm text-muted">
              One of {shelf.name.toLowerCase()} —{" "}
              <Link
                href={`/collections/${shelf.slug}`}
                className="text-gold underline underline-offset-4"
              >
                see the whole collection
              </Link>
              .
            </p>
          )}

          {list.owner && (
            <p className="mt-10 text-sm text-muted">
              Built by{" "}
              <Link
                href={`/community/${list.owner.username}`}
                className="text-gold underline underline-offset-4"
              >
                {list.owner.displayName}
              </Link>
              .
            </p>
          )}
        </div>
      </Container>
    </>
  );
}
