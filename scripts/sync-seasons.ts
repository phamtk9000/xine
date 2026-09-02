import "dotenv/config";
import { db } from "../lib/db";
import { fetchNextSeason, tmdbConfigured } from "../lib/tmdb";

/**
 * Ask TMDB when each running series comes back.
 *
 *   npm run series:seasons                 every series in the catalogue
 *   npm run series:seasons -- --limit 100  a slice of it
 *
 * One call per series, paced under the rate limit. Most return nothing —
 * a catalogue this size is mostly finished shows — and that is written back
 * as null, so a cancelled series stops advertising a date it will never
 * make. Safe to re-run; it is how the dates stay true.
 */

const PAUSE_MS = 90;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set in .env — nothing to sync.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const limit = args.includes("--limit")
    ? Number(args[args.indexOf("--limit") + 1])
    : undefined;

  const series = await db.film.findMany({
    where: { kind: "series", tmdbId: { not: null } },
    select: { id: true, title: true, tmdbId: true, nextSeasonAt: true },
    orderBy: { tmdbVotes: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  let dated = 0;
  let cleared = 0;
  let failed = 0;

  console.log(`Checking ${series.length} series…`);

  for (const show of series) {
    try {
      const next = await fetchNextSeason(show.tmdbId!);
      await sleep(PAUSE_MS);

      if (next) {
        await db.film.update({
          where: { id: show.id },
          data: { nextSeason: next.season, nextSeasonAt: next.airsAt },
        });
        dated++;
        console.log(
          `  + ${show.title} — season ${next.season} on ${next.airsAt.toISOString().slice(0, 10)}`,
        );
      } else if (show.nextSeasonAt) {
        // It had a date and no longer does: cancelled, finished, or moved.
        await db.film.update({
          where: { id: show.id },
          data: { nextSeason: null, nextSeasonAt: null },
        });
        cleared++;
      }
    } catch {
      failed++;
    }
  }

  console.log(
    `\n${dated} series with a date, ${cleared} cleared, ${failed} failed.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
