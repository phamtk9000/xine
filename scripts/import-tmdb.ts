import "dotenv/config";
import { db } from "../lib/db";
import { countryName } from "../lib/atlas";
import { importCandidates, type ImportRegion } from "../lib/import-regions";
import {
  fetchFilmDetail,
  fetchSeriesDetail,
  tmdbConfigured,
} from "../lib/tmdb";

/**
 * Grows the catalogue from TMDB, scoped to the regions XINE actually covers.
 *
 *   npm run films:import                 every region, default caps
 *   npm run films:import -- --region vn  one region
 *   npm run films:import -- --dry-run    list what would land, write nothing
 *   npm run films:import -- --pages 5    more pages per region
 *
 * Imported films are marked `reviewed: false` and carry TMDB's overview. They
 * are findable, rateable and listable, but they are not editorial until a
 * person writes the synopsis and sets a critic score. Nothing here ever
 * overwrites a reviewed film.
 */

function slugify(value: string, year: number | null) {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || `film-${year ?? "unknown"}`;
}

async function uniqueSlug(desired: string, tmdbId: number) {
  let slug = desired;
  for (let n = 2; ; n++) {
    const clash = await db.film.findUnique({
      where: { slug },
      select: { tmdbId: true },
    });
    if (!clash || clash.tmdbId === tmdbId) return slug;
    slug = `${desired}-${n}`;
    if (n > 20) return `${desired}-${tmdbId}`;
  }
}

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set in .env — nothing to import.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const regionArg = args[args.indexOf("--region") + 1];
  const onlyRegion = args.includes("--region") ? regionArg : null;
  const pagesArg = args.includes("--pages")
    ? Number(args[args.indexOf("--pages") + 1])
    : null;
  const kind: "film" | "series" =
    args[args.indexOf("--kind") + 1] === "series" && args.includes("--kind")
      ? "series"
      : "film";

  const before = await db.film.count();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  console.log(`Importing ${kind === "series" ? "TV series" : "films"}…`);

  const regions = await importCandidates({
    only: onlyRegion,
    pagesOverride: pagesArg,
    kind,
    onProgress: (region: ImportRegion, page: number, found: number) =>
      console.log(`  ${region.label}: page ${page} → ${found} candidates`),
  });

  for (const [region, candidates] of regions) {
    console.log(`\n${region.label} — ${candidates.length} candidates`);

    for (const candidate of candidates) {
      const existing = await db.film.findUnique({
        where: { kind_tmdbId: { kind, tmdbId: candidate.id } },
      });

      // Never touch a film someone has written about.
      if (existing?.reviewed) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `  + ${candidate.title} (${candidate.release_date?.slice(0, 4) ?? "?"}) — ${candidate.vote_average?.toFixed(1)} / ${candidate.vote_count} votes`,
        );
        created++;
        continue;
      }

      let detail;
      try {
        detail =
          kind === "series"
            ? await fetchSeriesDetail(candidate.id)
            : await fetchFilmDetail(candidate.id);
      } catch {
        console.warn(`  ! could not fetch ${candidate.title}`);
        continue;
      }

      // No authorial credit and no runtime means a TMDB data stub rather than
      // a real release. Series legitimately lack a runtime sometimes, so only
      // films are held to that part.
      const stub =
        detail.director === "Unknown" ||
        (kind === "film" && !detail.runtime);
      if (stub) {
        skipped++;
        continue;
      }

      const slug =
        existing?.slug ??
        (await uniqueSlug(slugify(detail.title, detail.year), candidate.id));

      const home = detail.originCountry?.split(",")[0] ?? null;

      const data = {
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
        // The real production country, not the region bucket this film was
        // paged out of. The bucket is an importer implementation detail —
        // "Chinese-language", "Middle East & North Africa" — and `country`
        // is the column the catalogue's country filter reads, so writing
        // labels there puts a filter option in front of readers that no
        // film claims to be from.
        country: home ? countryName(home) : region.label,
        language: detail.language,
        productionCountries: detail.productionCountries,
        synopsis: detail.synopsis || "No synopsis available yet.",
        genres: detail.genres,
        cast: detail.cast,
        cinematographer: detail.cinematographer,
        composer: detail.composer,
        posterUrl: detail.posterUrl,
        backdropUrl: detail.backdropUrl,
        releasedAt: detail.releasedAt,
        tmdbScore: candidate.vote_average ?? null,
        tmdbVotes: candidate.vote_count ?? 0,
        reviewed: false,
      };

      if (existing) {
        await db.film.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.film.create({ data });
        created++;
      }

      if ((created + updated) % 25 === 0) {
        process.stdout.write(`  …${created + updated} written\n`);
      }
    }
  }

  const after = dryRun ? before : await db.film.count();
  console.log(
    `\n${dryRun ? "[dry run] " : ""}created ${created}, updated ${updated}, skipped ${skipped}.`,
  );
  console.log(`Catalogue: ${before} → ${after} films.`);

  if (!dryRun) {
    const reviewed = await db.film.count({ where: { reviewed: true } });
    console.log(`${reviewed} reviewed, ${after - reviewed} awaiting review.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
