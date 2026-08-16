import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FilmRow } from "@/components/film-card";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { removeFromList } from "@/app/actions/lists";
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
  const [list, user] = await Promise.all([
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
  ]);

  if (!list) notFound();
  const mine = !!user && list.ownerId === user.id;

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
      },
    };
  });

  return (
    <>
      <PageHeader
        label={
          list.editorial
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
                <FilmRow film={entry.film} position={i + 1} note={entry.note} />
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
