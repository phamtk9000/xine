import "dotenv/config";
import { db } from "../lib/db";
import { syncUpcoming } from "../lib/ingest";
import { tmdbConfigured } from "../lib/tmdb";

/**
 * Fill the release calendar from TMDB.
 *
 *   npm run films:upcoming                  a year, one month at a time
 *   npm run films:upcoming -- --months 6    a shorter horizon
 *   npm run films:upcoming -- --pages 4     deeper into each month
 *   npm run films:upcoming -- --flat        one window for the whole span
 *
 * Safe to re-run: writes are keyed on the TMDB id, and dates that move are
 * picked up on the next pass — which is the point of running it on a
 * schedule rather than once. The daily cron runs it too.
 */

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set in .env — nothing to sync.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const num = (flag: string) =>
    args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : undefined;

  const before = await db.film.count();
  const progress = (title: string, status: string) => {
    if (status === "created") console.log(`  + ${title}`);
  };

  // A single twelve-month window is ranked by popularity across the whole
  // year, which fills the next two months and leaves the far end nearly
  // empty — the films dated next August are real but nobody is excited about
  // them yet. Walking a month at a time gives each month its own ranking, so
  // every part of the year gets its most notable titles.
  const report = { seen: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const span = num("--months") ?? 12;

  if (args.includes("--flat")) {
    const once = await syncUpcoming({
      months: span,
      pages: num("--pages"),
      onProgress: progress,
    });
    Object.assign(report, once);
  } else {
    for (let offset = 0; offset < span; offset++) {
      console.log(`\n+${offset} month${offset === 1 ? "" : "s"}`);
      const slice = await syncUpcoming({
        from: offset,
        months: 1,
        pages: num("--pages") ?? 2,
        onProgress: progress,
      });
      report.seen += slice.seen;
      report.created += slice.created;
      report.updated += slice.updated;
      report.skipped += slice.skipped;
      report.failed += slice.failed;
    }
  }

  const after = await db.film.count();
  console.log(
    `\n${report.seen} announced titles: ${report.created} added, ` +
      `${report.updated} refreshed, ${report.skipped} skipped, ` +
      `${report.failed} failed.`,
  );
  console.log(`Catalogue: ${before} → ${after} titles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
