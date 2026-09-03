import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { adopt, externalRef } from "@/lib/catalogue-pick";

/**
 * The door a TMDB search result opens.
 *
 * A page that writes on a GET, which is worth being explicit about: what it
 * writes is public film metadata against an id the reader supplied, it makes
 * the same row every time it runs, and it touches nothing that belongs to
 * anybody. That is the narrow case where import-on-view is honest — the
 * alternative is a confirmation screen between a reader and a film they have
 * already asked for twice.
 *
 * On success the reader never sees this page; they land on the film. Only a
 * title TMDB cannot describe well enough to import — no director, no
 * runtime, no art — stops here, and it says so rather than 404ing, because
 * "we could not import this" and "no such film" are different facts.
 */
export const dynamic = "force-dynamic";

export default async function ImportTitlePage({
  params,
}: PageProps<"/films/import/[kind]/[tmdbId]">) {
  const { kind, tmdbId } = await params;
  if (kind !== "film" && kind !== "series") notFound();

  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const result = await adopt(externalRef(kind, id));
  if (result) redirect(`/films/${result.film.slug}`);

  return (
    <Container className="py-24">
      <div className="mx-auto max-w-lg">
        <EmptyState
          title="That one will not import"
          body="TMDB has the title but not enough behind it — no director, no runtime, or no artwork. The catalogue refuses titles that thin, because a page with nothing on it is worse than an honest gap."
          action={<ButtonLink href="/films">Back to the catalogue</ButtonLink>}
        />
        <p className="mt-6 text-center text-xs text-faint">
          If it is a film you want written about,{" "}
          <Link href="/create/pitch" className="text-gold underline underline-offset-4">
            tell us
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
