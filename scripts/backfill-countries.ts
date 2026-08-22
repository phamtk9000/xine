import "dotenv/config";
import { db } from "@/lib/db";
import { tmdbConfigured } from "@/lib/tmdb";

/**
 * Backfill Film.productionCountries from TMDB.
 *
 * The `country` column was never geography — the importer writes the REGION
 * it paged the film out of, which is why 547 titles claim to be from
 * "Europe" and seven from "en". This pulls the real production countries so
 * the atlas has something true to draw.
 *
 * Idempotent and resumable: it only touches rows that are still null, so a
 * run that dies halfway costs nothing but the calls it already made.
 *
 *   npm run countries:backfill -- [--limit N] [--all] [--dry-run]
 */

const PAUSE_MS = 110; // ~9 req/s, comfortably inside TMDB's limit
const KEY = process.env.TMDB_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function detail(tmdbId: number, kind: string) {
  const path = kind === "series" ? "tv" : "movie";
  const res = await fetch(
    `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${KEY}`,
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as {
    production_countries?: { iso_3166_1: string }[];
    origin_country?: string[];
  };
}

function codesOf(movie: {
  production_countries?: { iso_3166_1: string }[];
  origin_country?: string[];
}) {
  const codes = (movie.production_countries ?? [])
    .map((c) => c.iso_3166_1)
    .concat(movie.origin_country ?? [])
    .map((c) => c?.toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(codes)];
  return unique.length ? unique.join(",") : null;
}

async function main() {
  if (!tmdbConfigured()) throw new Error("TMDB_API_KEY is not set");

  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const all = args.includes("--all");
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

  const films = await db.film.findMany({
    where: {
      tmdbId: { not: null },
      ...(all ? {} : { productionCountries: null }),
    },
    select: { id: true, tmdbId: true, kind: true, title: true },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`${films.length} films to fetch${dry ? " (dry run)" : ""}`);

  let done = 0, failed = 0, empty = 0;
  for (const film of films) {
    try {
      const codes = codesOf(await detail(film.tmdbId!, film.kind));
      if (!codes) empty++;
      if (!dry && codes) {
        await db.film.update({
          where: { id: film.id },
          data: { productionCountries: codes },
        });
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${films.length}…`);
    } catch {
      failed++;
    }
    await sleep(PAUSE_MS);
  }

  console.log(`done: ${done} fetched, ${empty} with no countries, ${failed} failed`);
}

main();
