import "dotenv/config";
import { db } from "../lib/db";
import { HOUSE_GENRES, genreCsv } from "../lib/genres";

/**
 * Rewrite every title's genres through the house vocabulary.
 *
 *   npm run genres:normalise
 *   npm run genres:normalise -- --dry-run
 *
 * A one-off for the catalogue as it stands: from here on the mapping happens
 * where titles are read out of TMDB (lib/tmdb.ts) and where the editorial
 * films are seeded, so this only needs running again after importing with an
 * older build. No network calls — it is a pure rewrite of stored strings.
 */

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const films = await db.film.findMany({
    select: { id: true, title: true, genres: true },
  });

  const before = new Map<string, number>();
  const after = new Map<string, number>();
  const changes: { title: string; from: string; to: string }[] = [];

  for (const film of films) {
    for (const label of film.genres.split(",")) {
      const key = label.trim();
      if (key) before.set(key, (before.get(key) ?? 0) + 1);
    }

    const normalised = genreCsv(film.genres);
    for (const label of normalised.split(",")) {
      const key = label.trim();
      if (key) after.set(key, (after.get(key) ?? 0) + 1);
    }

    if (normalised !== film.genres) {
      changes.push({ title: film.title, from: film.genres, to: normalised });
      if (!dryRun) {
        await db.film.update({
          where: { id: film.id },
          data: { genres: normalised },
        });
      }
    }
  }

  console.log(
    `${films.length} titles, ${changes.length} rewritten.\n` +
      `Vocabulary: ${before.size} labels → ${after.size}.`,
  );

  // Anything that vanished entirely was either folded into another genre or
  // dropped as not-a-genre; worth printing so a mapping mistake is visible.
  const gone = [...before.keys()].filter((label) => !after.has(label));
  if (gone.length) {
    console.log(`\nRetired labels (${gone.length}):`);
    for (const label of gone.sort()) {
      console.log(`  ${label} — was on ${before.get(label)} titles`);
    }
  }

  console.log("\nHouse genres now in use:");
  for (const genre of HOUSE_GENRES) {
    const count = after.get(genre) ?? 0;
    console.log(`  ${String(count).padStart(5)}  ${genre}`);
  }

  const strays = [...after.keys()].filter(
    (label) => !HOUSE_GENRES.includes(label as (typeof HOUSE_GENRES)[number]),
  );
  if (strays.length) console.log(`\n! Not in the house list: ${strays.join(", ")}`);
  if (dryRun) console.log("\n[dry run] nothing written.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
