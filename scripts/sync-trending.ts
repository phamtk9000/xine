import "dotenv/config";
import { db } from "../lib/db";
import { syncTrending } from "../lib/ingest";
import { tmdbConfigured } from "../lib/tmdb";

/**
 * Pull this week's TMDB trending titles into the catalogue so the homepage
 * row has pages to link to.
 *
 *   npm run films:trending              two pages (~40 titles)
 *   npm run films:trending -- --pages 5 deeper
 *
 * Safe to re-run: every write is keyed on the TMDB id, and a title someone
 * has already reviewed here is left alone. Worth running on the same cadence
 * as the row itself claims — weekly — or letting the daily cron do it.
 */

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set in .env — nothing to sync.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const pages = args.includes("--pages")
    ? Number(args[args.indexOf("--pages") + 1])
    : undefined;

  const before = await db.film.count();
  const report = await syncTrending({
    pages,
    onProgress: (title, status) => {
      if (status === "created") console.log(`  + ${title}`);
      else if (status === "failed") console.warn(`  ! ${title}`);
    },
  });

  const after = await db.film.count();
  console.log(
    `\n${report.seen} trending titles: ${report.created} added, ` +
      `${report.updated} refreshed, ${report.skipped} already known, ` +
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
