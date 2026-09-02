import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Poster } from "@/components/poster";
import { Container, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { SHELVES, findShelf } from "@/lib/collections";

/**
 * One shelf: eight lists, each with its films laid out in full.
 *
 * Deliberately not a grid of cards. A list here is an argument with eight
 * pieces of evidence, and a card that shows five posters and truncates the
 * rest hides exactly the part a reader is scanning for. So each list gets a
 * band — the claim on the left, the whole run of posters on the right — and
 * the page reads as a shelf you walk along.
 */

export function generateStaticParams() {
  return SHELVES.map((shelf) => ({ slug: shelf.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shelf = findShelf(slug);
  if (!shelf) return {};
  return { title: shelf.name, description: shelf.blurb };
}

export default async function CollectionPage({
  params,
}: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const shelf = findShelf(slug);
  if (!shelf) notFound();

  const lists = await db.filmList.findMany({
    where: { collection: shelf.slug },
    orderBy: { position: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      _count: { select: { entries: true } },
      entries: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          film: {
            select: {
              slug: true,
              title: true,
              year: true,
              director: true,
              posterUrl: true,
            },
          },
        },
      },
    },
  });

  if (lists.length === 0) notFound();

  const films = lists.reduce((sum, list) => sum + list._count.entries, 0);

  return (
    <>
      <PageHeader
        label="Collection"
        title={shelf.name}
        lede={shelf.blurb}
        action={
          <p className="label shrink-0">
            {lists.length} lists · {films} films
          </p>
        }
      />

      <Container className="py-6">
        {lists.map((list, index) => (
          <section
            key={list.id}
            className="grid gap-8 border-b border-line py-12 lg:grid-cols-[18rem_1fr] lg:gap-12"
          >
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="label">
                {String(index + 1).padStart(2, "0")} ·{" "}
                {list._count.entries} films
              </p>
              <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                <Link
                  href={`/lists/${list.slug}`}
                  className="transition-colors hover:text-gold"
                >
                  {list.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {list.description}
              </p>
              <Link
                href={`/lists/${list.slug}`}
                className="label mt-5 inline-block transition-colors hover:text-paper"
              >
                Open the list →
              </Link>
            </div>

            {/* Scrolls sideways on a phone rather than shrinking eight
                posters to thumbnails nobody can read. */}
            <ul className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0">
              {list.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="w-28 shrink-0 lg:w-auto lg:shrink"
                >
                  <Link href={`/films/${entry.film.slug}`} className="group block">
                    <Poster
                      film={entry.film}
                      sizes="(max-width: 1024px) 112px, 130px"
                    />
                    <p className="mt-2 truncate text-xs text-muted transition-colors group-hover:text-gold">
                      {entry.film.title}
                    </p>
                    <p className="text-[0.6875rem] text-faint tabular-nums">
                      {entry.film.year}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="py-12 text-sm text-muted">
          <Link
            href="/lists"
            className="text-gold underline underline-offset-4"
          >
            All collections
          </Link>
        </p>
      </Container>
    </>
  );
}
