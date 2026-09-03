import { db } from "@/lib/db";
import {
  discoverUpcoming,
  fetchFilmDetail,
  fetchSeriesDetail,
  fetchTrending,
} from "@/lib/tmdb";
import { countryName } from "@/lib/atlas";
import { slugify } from "@/lib/slug";

/**
 * Pull one title out of TMDB and into the catalogue, by id.
 *
 * The regional importer in scripts/import-tmdb.ts pages through discover and
 * writes what it finds; this is the other direction — something has already
 * decided that a specific title belongs here (it is trending, or a list names
 * it) and the catalogue simply has to be able to show a page for it.
 *
 * Two rules are shared with every other writer and must stay shared:
 *
 *   - A reviewed film is never overwritten. A person wrote that synopsis and
 *     set that critic score; TMDB's copy would silently replace both.
 *   - A title with no authorial credit and no runtime is a TMDB data stub,
 *     not a release, and is refused.
 *
 * `country` here is the real country name rather than the region label the
 * regional importer writes ("Europe"), because nothing about an id-addressed
 * import knows which region bucket it came from. Both are wrong as geography
 * and both are only used as a caption — lib/atlas.ts reads
 * `productionCountries`, which this sets properly.
 */

export type IngestOutcome =
  | { status: "created" | "updated" | "unchanged"; filmId: string; slug: string }
  | { status: "stub" | "failed"; reason: string };

async function uniqueSlug(desired: string, kind: string, tmdbId: number) {
  let slug = desired;
  for (let n = 2; ; n++) {
    const clash = await db.film.findUnique({
      where: { slug },
      select: { tmdbId: true, kind: true },
    });
    if (!clash || (clash.tmdbId === tmdbId && clash.kind === kind)) return slug;
    slug = `${desired}-${n}`;
    if (n > 20) return `${desired}-${tmdbId}`;
  }
}

export async function ingestTitle(
  tmdbId: number,
  kind: "film" | "series" = "film",
  /** TMDB's own average, which the detail endpoints don't return but the
   *  discover and trending rows that led us here do. */
  scores: {
    tmdbScore?: number | null;
    tmdbVotes?: number;
    /**
     * Accept a title that has no runtime and no director yet.
     *
     * The stub filter exists to keep TMDB's data debris out of a catalogue
     * of released cinema, and it works by demanding the two facts a real
     * release always has. An unreleased film has neither: the runtime is not
     * locked until the picture is, and TMDB routinely lists nothing but a
     * title, a date and a poster for eighteen months beforehand. Refusing
     * those would leave the calendar empty, which is why the calendar sync
     * — and only the calendar sync — turns this on.
     */
    allowUnreleased?: boolean;
  } = {},
): Promise<IngestOutcome> {
  const existing = await db.film.findUnique({
    where: { kind_tmdbId: { kind, tmdbId } },
    select: { id: true, slug: true, reviewed: true },
  });

  // Already here and already written about — the catalogue's own copy wins.
  if (existing?.reviewed) {
    return { status: "unchanged", filmId: existing.id, slug: existing.slug };
  }

  let detail;
  try {
    detail =
      kind === "series"
        ? await fetchSeriesDetail(tmdbId)
        : await fetchFilmDetail(tmdbId);
  } catch (error) {
    return { status: "failed", reason: String(error) };
  }

  const thin =
    detail.director === "Unknown" || (kind === "film" && !detail.runtime);

  if (thin && !scores.allowUnreleased) {
    return { status: "stub", reason: `${detail.title || tmdbId}: TMDB stub` };
  }

  // Even relaxed, a title needs *something*: a date it arrives on and art to
  // put beside it. Without both it is an entry nobody can act on.
  if (thin && (!detail.releasedAt || !detail.posterUrl)) {
    return {
      status: "stub",
      reason: `${detail.title || tmdbId}: no date or no art`,
    };
  }

  const slug =
    existing?.slug ??
    (await uniqueSlug(
      slugify(detail.title, `${kind}-${tmdbId}`),
      kind,
      tmdbId,
    ));

  const home = detail.originCountry?.split(",")[0] ?? null;

  const data = {
    slug,
    kind,
    seasons: "seasons" in detail ? (detail.seasons as number | null) : null,
    episodes: "episodes" in detail ? (detail.episodes as number | null) : null,
    tmdbId: detail.tmdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    year: detail.year,
    runtime: detail.runtime,
    director: detail.director,
    country: home ? countryName(home) : null,
    originCountry: detail.originCountry,
    productionCountries: detail.productionCountries,
    language: detail.language,
    synopsis: detail.synopsis || "No synopsis available yet.",
    genres: detail.genres,
    cast: detail.cast,
    cinematographer: detail.cinematographer,
    composer: detail.composer,
    posterUrl: detail.posterUrl,
    backdropUrl: detail.backdropUrl,
    releasedAt: detail.releasedAt,
    ...(scores.tmdbScore === undefined ? {} : { tmdbScore: scores.tmdbScore }),
    ...(scores.tmdbVotes === undefined ? {} : { tmdbVotes: scores.tmdbVotes }),
    reviewed: false,
  };

  const saved = existing
    ? await db.film.update({ where: { id: existing.id }, data })
    : await db.film.create({ data });

  return {
    status: existing ? "updated" : "created",
    filmId: saved.id,
    slug: saved.slug,
  };
}

export type TrendingSyncReport = {
  seen: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Set when a time budget stopped the run early; the rest waits for the
   *  next one, which is safe because every write here is idempotent. */
  ranOut: boolean;
};

/**
 * Bring this week's trending titles into the catalogue.
 *
 * Idempotent and keyed on TMDB ids, so it is safe to run on a schedule, by
 * hand, and halfway through a serverless time budget.
 */
export async function syncTrending(
  options: {
    pages?: number;
    /** Stop after this long. Omit for no limit (scripts); the cron sets it. */
    budgetMs?: number;
    onProgress?: (title: string, status: string) => void;
  } = {},
): Promise<TrendingSyncReport> {
  const started = Date.now();
  const report: TrendingSyncReport = {
    seen: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    ranOut: false,
  };

  // No revalidate: a sync wants what TMDB has now, not what a page render
  // cached six hours ago.
  const titles = await fetchTrending({
    media: "all",
    window: "week",
    pages: options.pages ?? 2,
    revalidate: 0,
  });
  report.seen = titles.length;

  for (const title of titles) {
    if (options.budgetMs && Date.now() - started > options.budgetMs) {
      report.ranOut = true;
      break;
    }

    const outcome = await ingestTitle(title.tmdbId, title.kind, {
      tmdbScore: title.voteAverage,
      tmdbVotes: title.voteCount,
    });

    if (outcome.status === "created") report.created++;
    else if (outcome.status === "updated") report.updated++;
    else if (outcome.status === "unchanged") report.skipped++;
    else if (outcome.status === "stub") report.skipped++;
    else report.failed++;

    options.onProgress?.(title.title, outcome.status);
  }

  return report;
}

export type UpcomingSyncReport = {
  seen: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  ranOut: boolean;
};

/**
 * Fill the release calendar: everything announced between today and the
 * horizon, films and series alike.
 *
 * Same rules as every other writer here — idempotent, keyed on TMDB ids,
 * never touching a title someone has reviewed — with one relaxation, which
 * is that unreleased titles are allowed to arrive without a runtime or a
 * director. See `allowUnreleased` on ingestTitle for why that is safe here
 * and nowhere else.
 */
export async function syncUpcoming(
  options: {
    /** How many months the window covers. A year, to match the calendar. */
    months?: number;
    /**
     * Where the window starts, in months from today.
     *
     * The daily job cannot afford to re-read a whole year every morning, and
     * it does not need to: the next few weeks are where dates actually move,
     * and the far end of the year only needs revisiting occasionally. So the
     * cron runs this twice — once over the near window, once over a single
     * month chosen by the date — and the offset is how it picks that month.
     */
    from?: number;
    /** Pages of results per kind. Twenty rows a page, filtered by popularity. */
    pages?: number;
    /** Override the distance-scaled popularity floor below. */
    minPopularity?: number;
    budgetMs?: number;
    onProgress?: (title: string, status: string) => void;
  } = {},
): Promise<UpcomingSyncReport> {
  const started = Date.now();
  const report: UpcomingSyncReport = {
    seen: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    ranOut: false,
  };

  const from = new Date();
  if (options.from) from.setMonth(from.getMonth() + options.from);
  const to = new Date(from);
  to.setMonth(to.getMonth() + (options.months ?? 12));
  const pages = Math.max(1, Math.min(options.pages ?? 3, 10));

  /**
   * The popularity floor has to relax with distance.
   *
   * Near months are noisy — hundreds of regional uploads carrying a date —
   * so a floor of 4 is what keeps the calendar readable. Nine months out the
   * noise is gone and so is most of the signal: February 2027 has 107 titles
   * on TMDB and exactly one above 4, while Narnia: The Magician's Nephew
   * sits at 3.4 and is plainly a film people are waiting for. Holding the
   * near-term bar out there does not filter noise, it filters everything.
   */
  const offset = options.from ?? 0;
  const floor =
    options.minPopularity ?? (offset <= 2 ? 4 : offset <= 5 ? 2.2 : 1.2);

  for (const kind of ["film", "series"] as const) {
    for (let page = 1; page <= pages; page++) {
      if (options.budgetMs && Date.now() - started > options.budgetMs) {
        report.ranOut = true;
        return report;
      }

      let batch;
      try {
        batch = await discoverUpcoming({
          kind,
          from,
          to,
          page,
          minPopularity: floor,
        });
      } catch {
        report.failed++;
        break;
      }
      if (batch.rows.length === 0 && page > batch.totalPages) break;

      report.seen += batch.rows.length;

      for (const row of batch.rows) {
        if (options.budgetMs && Date.now() - started > options.budgetMs) {
          report.ranOut = true;
          return report;
        }

        const outcome = await ingestTitle(row.tmdbId, kind, {
          tmdbScore: row.voteAverage,
          tmdbVotes: row.voteCount,
          allowUnreleased: true,
        });

        if (outcome.status === "created") report.created++;
        else if (outcome.status === "updated") report.updated++;
        else if (outcome.status === "failed") report.failed++;
        else report.skipped++;

        options.onProgress?.(row.title, outcome.status);
      }
    }
  }

  return report;
}
