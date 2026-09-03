import "server-only";
import { db } from "@/lib/db";
import { ingestTitle } from "@/lib/ingest";
import { searchTitles, tmdbConfigured } from "@/lib/tmdb";

/**
 * One row in a picker, whether or not this site has it yet.
 *
 * The catalogue is 1,797 titles and cinema is not. Somebody who wants to
 * rate The Piano Teacher, or put it in a list, does not care that nobody has
 * imported it — from where they sit the film simply is not here, and a
 * search that answers "no results" for a famous film reads as a broken site
 * rather than a small one.
 *
 * So a search that runs out of local answers keeps going into TMDB, and what
 * comes back is offered in the same list under its own heading. Those rows
 * carry a `tmdb:` reference instead of a database id, because they have no
 * row yet — opening one, or picking it, is what creates it.
 */

export type FilmPick = {
  /** A catalogue id, or `tmdb:film:1234` for something not imported yet. */
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  posterUrl: string | null;
  kind: string;
  /** True when this row is a TMDB result with nothing behind it here yet. */
  external?: boolean;
};

/** `tmdb:film:1234` → what to import. Anything else is a catalogue id. */
export function parseRef(
  ref: string,
): { kind: "film" | "series"; tmdbId: number } | null {
  const match = /^tmdb:(film|series):(\d+)$/.exec(ref);
  if (!match) return null;
  return { kind: match[1] as "film" | "series", tmdbId: Number(match[2]) };
}

export function externalRef(kind: "film" | "series", tmdbId: number) {
  return `tmdb:${kind}:${tmdbId}`;
}

/**
 * What TMDB has that the catalogue does not.
 *
 * Films and series in one call each, ranked by how much of the world has
 * voted on them — TMDB's own popularity is a trending measure and puts last
 * week's streaming release above Tokyo Story. Anything already imported is
 * dropped, so the two halves of a result list never show the same film
 * twice, and anything with no art or no year is dropped as well: those are
 * TMDB's data stubs, and offering one is offering a page that will fail to
 * import when it is clicked.
 */
export async function externalMatches(
  query: string,
  take: number,
): Promise<FilmPick[]> {
  if (!tmdbConfigured() || query.trim().length < 2 || take <= 0) return [];

  const [films, series] = await Promise.all([
    searchTitles(query, "film").catch(() => []),
    searchTitles(query, "series").catch(() => []),
  ]);

  const rows = [
    ...films.map((row) => ({ ...row, kind: "film" as const })),
    ...series.map((row) => ({ ...row, kind: "series" as const })),
  ]
    .filter((row) => row.posterUrl && row.year)
    .sort((a, b) => b.voteCount - a.voteCount);

  if (rows.length === 0) return [];

  // One query rather than one per row: the ids we already hold, so a film
  // that is in the catalogue is never offered as if it were not.
  const held = await db.film.findMany({
    where: {
      OR: rows.map((row) => ({ kind: row.kind, tmdbId: row.tmdbId })),
    },
    select: { kind: true, tmdbId: true },
  });
  const seen = new Set(held.map((film) => `${film.kind}:${film.tmdbId}`));

  return rows
    .filter((row) => !seen.has(`${row.kind}:${row.tmdbId}`))
    .slice(0, take)
    .map((row) => ({
      id: externalRef(row.kind, row.tmdbId),
      slug: externalRef(row.kind, row.tmdbId),
      title: row.title,
      year: row.year ?? 0,
      // Blank rather than a placeholder sentence: the search endpoint does
      // not return credits, the detail fetch on import does, and every
      // caller already marks these rows out as external in its own words.
      director: "",
      posterUrl: row.posterUrl,
      kind: row.kind,
      external: true,
    }));
}

/**
 * Import a TMDB reference and hand back the row it became.
 *
 * Lives here rather than in the server action because a server component
 * cannot call an action that revalidates — Next refuses a cache
 * invalidation raised during a render, and the import route is a render.
 * So this is the work, the action around it is the work plus the cache
 * concern, and the two callers take the half they are allowed to.
 *
 * Idempotent: `ingestTitle` returns the existing row for a film already
 * here, and never touches one that has been written about. A double-click,
 * a refresh and a shared link all land on the same film.
 */
export async function adopt(
  ref: string,
): Promise<{ film: FilmPick; created: boolean } | null> {
  const parsed = parseRef(ref);
  if (!parsed) return null;

  const outcome = await ingestTitle(parsed.tmdbId, parsed.kind);
  if (!("filmId" in outcome)) return null;

  const film = await db.film.findUnique({
    where: { id: outcome.filmId },
    select: {
      id: true,
      slug: true,
      title: true,
      year: true,
      director: true,
      posterUrl: true,
      kind: true,
    },
  });
  if (!film) return null;

  return { film, created: outcome.status === "created" };
}
