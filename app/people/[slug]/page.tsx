import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { Poster } from "@/components/poster";
import { SealMark } from "@/components/seal";
import { getPersonBySlug } from "@/lib/people";
import { editorialCounts } from "@/lib/films";

export async function generateMetadata({
  params,
}: PageProps<"/people/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPersonBySlug(slug);
  if (!found) return {};
  return {
    title: found.person.name,
    description: `${found.person.name} on xine — ${found.credits.length} title${
      found.credits.length === 1 ? "" : "s"
    } in the catalogue.`,
  };
}

export default async function PersonPage({
  params,
}: PageProps<"/people/[slug]">) {
  const { slug } = await params;
  const [found, reviewCounts] = await Promise.all([
    getPersonBySlug(slug),
    editorialCounts(),
  ]);
  if (!found) notFound();

  const { person, credits } = found;

  return (
    <>
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-end gap-8">
            {person.profileUrl && (
              <div className="relative aspect-2/3 w-32 shrink-0 overflow-hidden rounded-[3px] bg-ink-raised sm:w-40">
                <Image
                  src={person.profileUrl}
                  alt=""
                  fill
                  sizes="160px"
                  priority
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <p className="label">Cast</p>
              <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
                {person.name}
              </h1>
              <p className="mt-5 text-sm text-muted">
                {credits.length} title{credits.length === 1 ? "" : "s"} in the
                xine catalogue
              </p>
            </div>
          </div>
        </Container>
      </header>

      <Container className="py-14">
        <h2 className="label border-b border-line pb-3">Filmography</h2>

        {credits.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            Nothing in the catalogue yet.
          </p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {credits.map((credit) => (
              <li key={credit.id}>
                <Link
                  href={`/films/${credit.film.slug}`}
                  className="group block"
                >
                  <Poster
                    film={{
                      slug: credit.film.slug,
                      title: credit.film.title,
                      year: credit.film.year,
                      director: credit.film.director,
                      posterUrl: credit.film.posterUrl,
                    }}
                  />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm leading-snug font-medium group-hover:text-gold">
                        {credit.film.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-faint">
                        {credit.film.year}
                        {credit.character ? ` · ${credit.character}` : ""}
                      </p>
                    </div>
                    {credit.film.reviewed &&
                      credit.film.criticScore !== null && (
                        <SealMark
                          score={credit.film.criticScore}
                          reviewCount={reviewCounts.get(credit.film.slug) ?? 0}
                        />
                      )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
