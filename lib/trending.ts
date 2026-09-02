import "server-only";
import { db } from "@/lib/db";
import { listFilms, summariseFilms, type FilmSummary } from "@/lib/films";
import { fetchTrending, tmdbConfigured } from "@/lib/tmdb";

/**
 * "Trending this week", meaning this week rather than this catalogue.
 *
 * The catalogue's own `trending` sort ranks by how many XINE members have
 * rated something, which is a claim about XINE's members. Useful, but it is
 * not what the homepage row promises — so this asks TMDB what the world is
 * watching and then looks each title up locally, because a card has to link
 * somewhere and only the catalogue has pages.
 *
 * Titles TMDB is trending that XINE has never heard of are simply absent
 * here; getting them in is a write, and a page render must not write. That
 * job belongs to `npm run films:trending` and to the daily cron, both of
 * which call syncTrending in lib/ingest.ts. The row is then topped up from the
 * catalogue sort so it is never short of cards, whatever the overlap.
 */

/** How deep into TMDB's ranking to look before giving up on a match. */
const SCAN_PAGES = 2;

/** A title trending before anyone can watch it, with the date they can. */
export type ComingTitle = FilmSummary & { releasedAt: Date | null };

export type TrendingWeek = {
  /** Out now — the rake. */
  now: FilmSummary[];
  /** Trending, but not released yet. */
  coming: ComingTitle[];
};

/**
 * This week, split by whether you can actually watch the thing.
 *
 * TMDB's trending feed is a mix of what is playing and what is being
 * marketed: in a given week a third of it can be trailers for films six
 * months out. Rolling those into a row headed "Trending this week" made the
 * homepage recommend Toy Story 5 to a reader who came for In the Mood for
 * Love — the feed was right and the framing was wrong.
 *
 * So the unreleased ones are not dropped (they are real news, and they are
 * the only forward-looking thing on the page) but they are stated as what
 * they are, in a line of their own.
 */
export async function weeklyTrending({
  take = 10,
  comingTake = 5,
}: { take?: number; comingTake?: number } = {}): Promise<TrendingWeek> {
  const catalogue = () => listFilms({ sort: "trending", take });
  const fallback = async (): Promise<TrendingWeek> => ({
    now: await catalogue(),
    coming: [],
  });

  if (!tmdbConfigured()) return fallback();

  let titles;
  try {
    titles = await fetchTrending({
      media: "all",
      window: "week",
      pages: SCAN_PAGES,
    });
  } catch {
    // TMDB being down is not a reason for the homepage to be down.
    return fallback();
  }
  if (titles.length === 0) return fallback();

  const movieIds = titles.filter((t) => t.kind === "film").map((t) => t.tmdbId);
  const seriesIds = titles
    .filter((t) => t.kind === "series")
    .map((t) => t.tmdbId);

  const rows = await db.film.findMany({
    where: {
      OR: [
        ...(movieIds.length ? [{ kind: "film", tmdbId: { in: movieIds } }] : []),
        ...(seriesIds.length
          ? [{ kind: "series", tmdbId: { in: seriesIds } }]
          : []),
      ],
    },
  });

  const rank = new Map(titles.map((t) => [`${t.kind}:${t.tmdbId}`, t.rank]));
  rows.sort(
    (a, b) =>
      (rank.get(`${a.kind}:${a.tmdbId}`) ?? Infinity) -
      (rank.get(`${b.kind}:${b.tmdbId}`) ?? Infinity),
  );

  // A release date in the future is the reliable signal. Where TMDB has no
  // date at all, a year beyond this one is the same claim by other means —
  // and a missing date on an old title is not evidence of anything, so it
  // stays in the rake.
  const now = Date.now();
  const thisYear = new Date().getFullYear();
  const unreleased = (row: (typeof rows)[number]) =>
    row.releasedAt ? row.releasedAt.getTime() > now : row.year > thisYear;

  const out = rows.filter((row) => !unreleased(row));
  const soon = rows.filter(unreleased);

  const dates = new Map(rows.map((row) => [row.id, row.releasedAt]));
  const coming: ComingTitle[] = (
    await summariseFilms(soon.slice(0, comingTake))
  ).map((film) => ({ ...film, releasedAt: dates.get(film.id) ?? null }));

  const ranked = await summariseFilms(out.slice(0, take));
  if (ranked.length >= take) return { now: ranked, coming };

  // Short of a full rake. Fill from the catalogue rather than render a gap.
  const seen = new Set(ranked.map((film) => film.id));
  const filler = (await catalogue()).filter((film) => !seen.has(film.id));
  return { now: [...ranked, ...filler].slice(0, take), coming };
}
