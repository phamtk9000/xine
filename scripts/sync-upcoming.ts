import "dotenv/config";
import { db } from "../lib/db";
import { syncUpcoming } from "../lib/ingest";
import { tmdbConfigured } from "../lib/tmdb";

/**
 * Fill the release calendar from TMDB.
 *
 *   npm run films:upcoming                  nine months ahead
 *   npm run films:upcoming -- --months 12   further out
 *   npm run films:upcoming -- --pages 5     deeper per month window
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
  const report = await syncUpcoming({
    months: num("--months"),
    pages: num("--pages"),
    onProgress: (title, status) => {
      if (status === "created") console.log(`  + ${title}`);
    },
  });

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
