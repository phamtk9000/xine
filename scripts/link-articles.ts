import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import matter from "gray-matter";
import { db } from "../lib/db";
import {
  fetchFilmDetail,
  fetchSeriesDetail,
  searchMovie,
  searchSeries,
  tmdbConfigured,
} from "../lib/tmdb";

/**
 * Imports whatever the Journal references but the catalogue does not hold.
 *
 * Editorial leads the catalogue, not the other way round: a writer should be
 * able to reference a film without first checking whether an import region
 * happened to cover it. This reads the `films:` frontmatter across every
 * article, finds the slugs that resolve to nothing, and fetches exactly those.
 *
 *   npm run films:link              import everything missing
 *   npm run films:link -- --dry-run list what is missing, write nothing
 */


/**
 * Titles a bare search resolves wrongly.
 *
 * "Godzilla" returns the 2014 Hollywood film, which is the opposite of the
 * 1954 nuclear-anxiety original an article about generational fear means.
 * "Attack on Titan" returns the live-action film rather than the series.
 * These are the cases where the first search result is confidently incorrect,
 * so the intent is stated explicitly rather than guessed.
 */
const HINTS: Record<string, { query: string; year?: number; kind?: "film" | "series" }> = {
  godzilla: { query: "Godzilla", year: 1954, kind: "film" },
  ringu: { query: "Ringu", year: 1998, kind: "film" },
  pulse: { query: "Kairo", year: 2001, kind: "film" },
  host: { query: "Host", year: 2020, kind: "film" },
  "death-note": { query: "Death Note", year: 2006, kind: "series" },
  "code-geass": { query: "Code Geass", year: 2006, kind: "series" },
  "attack-on-titan": { query: "Attack on Titan", year: 2013, kind: "series" },
};

function titleFromSlug(slug: string) {
  return slug.replace(/-/g, " ");
}

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set — cannot resolve missing titles.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");

  const wanted = new Map<string, string[]>();
  for (const file of readdirSync("content/journal").filter((f) => f.endsWith(".md"))) {
    const { data } = matter(readFileSync(`content/journal/${file}`, "utf8"));
    for (const slug of (data.films ?? []) as string[]) {
      wanted.set(slug, [...(wanted.get(slug) ?? []), file.replace(/\.md$/, "")]);
    }
  }

  let added = 0;
  let failed = 0;

  for (const [slug, articles] of wanted) {
    if (await db.film.findUnique({ where: { slug }, select: { id: true } })) continue;

    const hint = HINTS[slug];
    const query = hint?.query ?? titleFromSlug(slug);

    // Try film first, then series — an article referencing Attack on Titan
    // should not need to say which it is, unless a hint says otherwise.
    const wantSeries = hint?.kind === "series";
    const movie = wantSeries ? null : await searchMovie(query, hint?.year);
    const series =
      movie ? null : await searchSeries(query, hint?.year);

    if (!movie && !series) {
      console.warn(`  ? no match for "${query}"  ← ${articles.join(", ")}`);
      failed++;
      continue;
    }

    const kind = movie ? "film" : "series";
    const id = (movie ?? series)!.id;

    if (dryRun) {
      console.log(`  + ${slug} → ${kind} ${id}`);
      added++;
      continue;
    }

    const detail =
      kind === "series" ? await fetchSeriesDetail(id) : await fetchFilmDetail(id);

    // The article's slug wins over anything derived from TMDB — the link in
    // the prose is the contract, and rewriting it would break the article.
    await db.film.upsert({
      where: { kind_tmdbId: { kind, tmdbId: id } },
      create: {
        slug,
        kind,
        tmdbId: id,
        title: detail.title,
        originalTitle: detail.originalTitle,
        year: detail.year,
        runtime: detail.runtime,
        seasons: "seasons" in detail ? (detail.seasons as number | null) : null,
        episodes: "episodes" in detail ? (detail.episodes as number | null) : null,
        director: detail.director,
        country: detail.language === "ja" ? "Japan" : (detail.language ?? "—"),
        language: detail.language,
        synopsis: detail.synopsis || "No synopsis available yet.",
        genres: detail.genres,
        cast: detail.cast,
        cinematographer: detail.cinematographer,
        composer: detail.composer,
        posterUrl: detail.posterUrl,
        backdropUrl: detail.backdropUrl,
        releasedAt: detail.releasedAt,
        reviewed: false,
      },
      update: { slug },
    });

    console.log(`  ✓ ${detail.title} (${detail.year}) → /${slug}`);
    added++;
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}${added} linked, ${failed} unresolved.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
