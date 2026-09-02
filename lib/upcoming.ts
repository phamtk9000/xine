import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";

/**
 * The release calendar — what is announced, in the order it arrives.
 *
 * Read-only, like every page path here: getting titles into the catalogue is
 * `npm run films:upcoming`, and `npm run series:seasons` for the returning
 * ones (see lib/ingest.ts and scripts/sync-seasons.ts). This just reads
 * forward from today.
 *
 * Two things are being merged, and the distinction matters. A film or a new
 * series has a *release date* — its first appearance. A running series has a
 * *next season*, which is not a release at all as far as the data model is
 * concerned, and is the thing most people are actually waiting for: nobody
 * is counting down to a show they have never heard of, they are counting
 * down to season three of the one they finished last year.
 *
 * Grouped by month rather than by week or by day. A week is too short a unit
 * for cinema — most weeks hold two titles and some hold none, which draws a
 * calendar full of holes — and a flat list of ninety dates is not a calendar
 * at all, it is a queue.
 */

export type CalendarKind = "all" | "film" | "series";

export type CalendarEntry = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  year: number;
  director: string;
  genres: string[];
  posterUrl: string | null;
  /** The date this entry is *for* — a release, or a season premiere. */
  date: Date;
  /** Set when this row is a returning season rather than a first release. */
  season: number | null;
  /** Null until TMDB locks it, which is most of the point of the calendar. */
  runtime: number | null;
  seasons: number | null;
  /** Whether the viewer has this on their watchlist. */
  saved: boolean;
};

export type CalendarMonth = {
  month: Date;
  label: string;
  entries: CalendarEntry[];
};

/** How far ahead to read. Past this TMDB's dates are guesses anyway. */
const HORIZON_MONTHS = 12;

const SELECT = {
  id: true,
  slug: true,
  title: true,
  kind: true,
  year: true,
  director: true,
  genres: true,
  posterUrl: true,
  releasedAt: true,
  nextSeason: true,
  nextSeasonAt: true,
  runtime: true,
  seasons: true,
} as const;

function window() {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + HORIZON_MONTHS);
  return { now, horizon };
}

export async function upcomingByMonth(
  kind: CalendarKind = "all",
  options: { viewerId?: string | null; savedOnly?: boolean } = {},
): Promise<CalendarMonth[]> {
  const { now, horizon } = window();
  const kindWhere = kind === "all" ? {} : { kind };

  const [releases, returning, saved] = await Promise.all([
    db.film.findMany({
      where: { releasedAt: { gt: now, lte: horizon }, ...kindWhere },
      select: SELECT,
    }),
    // Returning seasons are series by definition, so the film filter excludes
    // them rather than querying for something that cannot exist.
    kind === "film"
      ? Promise.resolve([])
      : db.film.findMany({
          where: { nextSeasonAt: { gt: now, lte: horizon } },
          select: SELECT,
        }),
    options.viewerId
      ? db.watchlistItem
          .findMany({
            where: { userId: options.viewerId },
            select: { filmId: true },
          })
          .then((rows) => new Set(rows.map((row) => row.filmId)))
      : Promise.resolve(new Set<string>()),
  ]);

  const shape = (
    row: (typeof releases)[number],
    date: Date,
    season: number | null,
  ): CalendarEntry => ({
    id: season ? `${row.id}-s${season}` : row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    year: row.year,
    director: row.director,
    genres: fromCsv(row.genres),
    posterUrl: row.posterUrl,
    date,
    season,
    runtime: row.runtime,
    seasons: row.seasons,
    saved: saved.has(row.id),
  });

  const entries = [
    ...releases.map((row) => shape(row, row.releasedAt!, null)),
    ...returning.map((row) => shape(row, row.nextSeasonAt!, row.nextSeason)),
  ]
    .filter((entry) => (options.savedOnly ? entry.saved : true))
    .sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title),
    );

  const months = new Map<string, CalendarMonth>();

  for (const entry of entries) {
    const key = `${entry.date.getUTCFullYear()}-${entry.date.getUTCMonth()}`;

    if (!months.has(key)) {
      const first = new Date(
        Date.UTC(entry.date.getUTCFullYear(), entry.date.getUTCMonth(), 1),
      );
      months.set(key, {
        month: first,
        label: first.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        entries: [],
      });
    }

    months.get(key)!.entries.push(entry);
  }

  return [...months.values()];
}

/** Counts for the filter chips, so a filter never leads to an empty page. */
export async function upcomingCounts(viewerId?: string | null) {
  const { now, horizon } = window();
  const dated = { releasedAt: { gt: now, lte: horizon } };
  const returning = { nextSeasonAt: { gt: now, lte: horizon } };

  const [films, newSeries, seasons, saved] = await Promise.all([
    db.film.count({ where: { ...dated, kind: "film" } }),
    db.film.count({ where: { ...dated, kind: "series" } }),
    db.film.count({ where: returning }),
    viewerId
      ? db.film.count({
          where: {
            OR: [dated, returning],
            watchlistItems: { some: { userId: viewerId } },
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    all: films + newSeries + seasons,
    film: films,
    series: newSeries + seasons,
    saved,
  };
}

/**
 * The one line worth putting in front of somebody who has a watchlist: how
 * much of it is about to arrive. Returns null for signed-out readers and for
 * anyone whose list has nothing dated, so the caller can simply not render.
 */
export async function watchlistLanding(viewerId: string) {
  const { now } = window();
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  const rows = await db.film.findMany({
    where: {
      watchlistItems: { some: { userId: viewerId } },
      OR: [
        { releasedAt: { gt: now, lte: monthEnd } },
        { nextSeasonAt: { gt: now, lte: monthEnd } },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      posterUrl: true,
      releasedAt: true,
      nextSeason: true,
      nextSeasonAt: true,
    },
    orderBy: { releasedAt: "asc" },
  });

  if (rows.length === 0) return null;

  return rows
    .map((row) => {
      const seasonDate =
        row.nextSeasonAt && row.nextSeasonAt > now && row.nextSeasonAt <= monthEnd
          ? row.nextSeasonAt
          : null;
      const releaseDate =
        row.releasedAt && row.releasedAt > now && row.releasedAt <= monthEnd
          ? row.releasedAt
          : null;
      // A series can have both; the sooner one is the one being waited for.
      const date =
        seasonDate && releaseDate
          ? seasonDate < releaseDate
            ? seasonDate
            : releaseDate
          : (seasonDate ?? releaseDate!);

      return {
        slug: row.slug,
        title: row.title,
        posterUrl: row.posterUrl,
        date,
        season: date === seasonDate ? row.nextSeason : null,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
