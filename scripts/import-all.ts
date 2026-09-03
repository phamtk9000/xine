import "dotenv/config";
import { db } from "../lib/db";
import { countryName } from "../lib/atlas";
import {
  fetchFilmDetail,
  fetchSeriesDetail,
  tmdbConfigured,
} from "../lib/tmdb";
import { slugify } from "../lib/slug";

/**
 * The whole of TMDB, as far down as you tell it to go.
 *
 *   npm run films:all                      films with 10+ votes  (~94,000)
 *   npm run films:all -- --min-votes 50    the well-known half   (~34,000)
 *   npm run films:all -- --min-votes 1     nearly everything    (~318,000)
 *   npm run films:all -- --kind series     television
 *   npm run films:all -- --from 1990 --to 1999
 *   npm run films:all -- --dry-run
 *
 * Why a second importer rather than more pages on the first one: that one
 * walks regions, and TMDB stops any single discover query at 500 pages —
 * 10,000 results — so no amount of paging reaches past the first ten
 * thousand films of a region. This slices by release year instead, which is
 * the one dimension that cuts the catalogue into pieces small enough to page
 * through completely. 1900 to next year, one query per year.
 *
 * What "all" is worth having:
 *
 *   >= 100 votes   23,000 films   the canon and the mainstream
 *   >=  10 votes   94,000 films   everything anybody searches for
 *   >=   1 vote   318,000 films   plus a great deal of nothing
 *   >=   0 votes  493,000 films   home video, festival submissions, noise
 *
 * The floor is a knob rather than a decision, because it is a real trade and
 * it is not this script's to make. Below ten votes TMDB is mostly untitled
 * shorts and regional television rips; the on-demand import already covers
 * those the moment somebody actually searches for one.
 *
 * Resumable by construction: it asks the database what it already has before
 * spending a detail fetch, so a run that dies at hour two costs nothing but
 * the paging to get back there. Safe to run repeatedly.
 */

const PAUSE_MS = 60; // ~16 req/s, well inside TMDB's ceiling
const PAGE_LIMIT = 500; // TMDB's own cap

type Row = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
};

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

async function discover(
  kind: "film" | "series",
  year: number,
  minVotes: number,
  page: number,
): Promise<{ rows: Row[]; pages: number; total: number }> {
  const series = kind === "series";
  const params = new URLSearchParams({
    api_key: process.env.TMDB_API_KEY!,
    include_adult: "false",
    include_video: "false",
    "vote_count.gte": String(minVotes),
    sort_by: "vote_count.desc",
    page: String(page),
    [series ? "first_air_date_year" : "primary_release_year"]: String(year),
    ...(series ? {} : { "with_runtime.gte": "60" }),
  });

  const response = await fetchRetrying(
    `https://api.themoviedb.org/3/discover/${series ? "tv" : "movie"}?${params}`,
  );
  if (!response.ok) return { rows: [], pages: 0, total: 0 };

  const data = (await response.json()) as {
    results?: Row[];
    total_pages?: number;
    total_results?: number;
  };
  return {
    rows: data.results ?? [],
    pages: Math.min(data.total_pages ?? 0, PAGE_LIMIT),
    total: data.total_results ?? 0,
  };
}

/**
 * A fetch that survives a DNS hiccup or a dropped connection.
 *
 * A nine-hour run crosses a home network's flaky minutes more or less
 * guaranteed, and the bare `fetch` this used to be treated any of that as
 * fatal — one `ENOTFOUND` killed the whole sweep with no output pointing at
 * where to resume, even though resuming was already free by construction.
 */
async function fetchRetrying(url: string, attempts = 5): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt >= attempts) throw error;
      const wait = 500 * 2 ** (attempt - 1);
      process.stdout.write(
        `  … network error (${(error as Error).message}), retrying in ${wait}ms\n`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** One write, retried through a busy database or a dropped connection. */
async function write<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
    }
  }
}

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

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set in .env — nothing to import.");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const kind: "film" | "series" = process.argv.includes("--kind")
    ? (process.argv[process.argv.indexOf("--kind") + 1] as "film" | "series")
    : "film";
  const minVotes = arg("min-votes", 10);
  const thisYear = new Date().getFullYear();
  const from = arg("from", 1900);
  const to = arg("to", thisYear + 1);

  const before = await db.film.count();
  console.log(
    `Importing ${kind === "series" ? "series" : "films"} with ${minVotes}+ votes, ${from}–${to}.`,
  );
  console.log(`Catalogue starts at ${before} titles.\n`);

  let created = 0;
  let skipped = 0;
  let stubs = 0;
  let failed = 0;

  for (let year = to; year >= from; year--) {
    const first = await discover(kind, year, minVotes, 1);
    if (first.total === 0) continue;

    console.log(`${year}: ${first.total} on TMDB`);

    for (let page = 1; page <= first.pages; page++) {
      const { rows } = page === 1 ? first : await discover(kind, year, minVotes, page);
      if (rows.length === 0) break;

      // One query per page rather than one per title: which of these sixty
      // are already here.
      const ids = rows.map((row) => row.id);
      const held = new Set(
        (
          await db.film.findMany({
            where: { kind, tmdbId: { in: ids } },
            select: { tmdbId: true },
          })
        ).map((film) => film.tmdbId),
      );

      for (const row of rows) {
        if (held.has(row.id)) {
          skipped++;
          continue;
        }
        if (dryRun) {
          created++;
          continue;
        }

        let detail;
        try {
          detail =
            kind === "series"
              ? await fetchSeriesDetail(row.id)
              : await fetchFilmDetail(row.id);
        } catch {
          failed++;
          continue;
        }

        // The same bar the on-demand import uses: a title with no authorial
        // credit and no runtime is a TMDB stub, not a release.
        if (
          detail.director === "Unknown" ||
          (kind === "film" && !detail.runtime) ||
          !detail.posterUrl
        ) {
          stubs++;
          continue;
        }

        const home = detail.originCountry?.split(",")[0] ?? null;
        const slug = await uniqueSlug(
          slugify(detail.title, `${kind}-${row.id}`),
          kind,
          row.id,
        );

        try {
          await write(() =>
            db.film.create({
              data: {
                slug,
                kind,
                seasons: "seasons" in detail ? (detail.seasons as number | null) : null,
                episodes:
                  "episodes" in detail ? (detail.episodes as number | null) : null,
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
                tmdbScore: row.vote_average ?? null,
                tmdbVotes: row.vote_count ?? 0,
                reviewed: false,
              },
            }),
          );
          created++;
        } catch {
          // Almost always a slug or id race with another run. Not fatal.
          failed++;
        }

        if (created % 100 === 0 && created > 0) {
          process.stdout.write(
            `  …${created} imported, ${skipped} already here, ${stubs} too thin\n`,
          );
        }

        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }
  }

  const after = dryRun ? before : await db.film.count();
  console.log(
    `\n${dryRun ? "[dry run] " : ""}imported ${created}, already here ${skipped}, too thin ${stubs}, failed ${failed}.`,
  );
  console.log(`Catalogue: ${before} → ${after} titles.`);
}

main();
