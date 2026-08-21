import "server-only";
import { db } from "@/lib/db";
import { personSlug } from "@/lib/slug";

export { personSlug };

/**
 * Cast — the people in a title, and the titles a person is in.
 *
 * The `cast` string on Film stays where it is: it's the cheap denormalised
 * list that cards and search read, and rewriting every consumer of it to
 * join through Credit would cost more than it returns. This module is the
 * clickable layer on top — Person and Credit rows, populated by
 * `npm run credits:import`.
 */

export type CastMember = {
  slug: string;
  name: string;
  character: string | null;
  profileUrl: string | null;
};

/**
 * Billed cast for a film, most prominent first.
 *
 * `take` defaults to the top of the bill rather than everyone: a film page
 * wants its leads, and TMDB will happily return ninety names including
 * "Party Guest #3".
 */
export async function castForFilm(
  filmId: string,
  take = 10,
): Promise<CastMember[]> {
  const credits = await db.credit.findMany({
    where: { filmId },
    orderBy: { order: "asc" },
    take,
    include: {
      person: { select: { slug: true, name: true, profileUrl: true } },
    },
  });

  return credits.map((credit) => ({
    slug: credit.person.slug,
    name: credit.person.name,
    character: credit.character,
    profileUrl: credit.person.profileUrl,
  }));
}

/**
 * A person and everything they're credited in, newest first.
 *
 * Returns null rather than throwing so the route can render a 404 — a slug
 * that no longer resolves is a missing page, not a server error.
 */
export async function getPersonBySlug(slug: string) {
  const person = await db.person.findUnique({
    where: { slug },
    include: {
      credits: {
        include: {
          film: {
            select: {
              id: true,
              slug: true,
              title: true,
              year: true,
              director: true,
              posterUrl: true,
              criticScore: true,
              reviewed: true,
              kind: true,
            },
          },
        },
      },
    },
  });

  if (!person) return null;

  const credits = [...person.credits].sort(
    (a, b) => (b.film.year ?? 0) - (a.film.year ?? 0),
  );

  return { person, credits };
}
