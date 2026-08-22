import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchCast, fetchFilmDetail, tmdbConfigured } from "@/lib/tmdb";
import { importCandidates } from "@/lib/import-regions";
import { personSlug } from "@/lib/slug";

/**
 * The daily catalogue refresh, for a Vercel cron.
 *
 * Deliberately incremental rather than a full re-import. A serverless
 * function is time-boxed (see `maxDuration`), and a full pass over the
 * catalogue takes minutes — so this does as much as it can inside a budget
 * and leaves the rest for tomorrow. Everything it does is idempotent and
 * keyed on TMDB ids, so stopping halfway is safe and the next run picks up
 * where this one left off.
 *
 * Two jobs, in priority order:
 *   1. Pull newly-released titles from TMDB in the regions XINE covers.
 *   2. Backfill cast for any title still missing it.
 *
 * IMPORTANT: this can only persist anything if DATABASE_URL points at a
 * networked database. On Vercel the filesystem is ephemeral and read-only,
 * so the current SQLite file would either reject the write or accept it into
 * a copy that vanishes when the invocation ends. See the README note.
 */

// Vercel's default is 10s on Hobby; this needs the room. Pro allows up to 300.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Stop this far short of maxDuration so the response still gets out. */
const BUDGET_MS = 50_000;
const TOP_BILLED = 15;

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

async function uniqueFilmSlug(desired: string, tmdbId: number) {
  let slug = desired;
  for (let n = 2; ; n++) {
    const clash = await db.film.findUnique({ where: { slug } });
    if (!clash || clash.tmdbId === tmdbId) return slug;
    slug = `${desired}-${n}`;
  }
}

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this the
  // endpoint is a public button that burns the TMDB quota.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tmdbConfigured()) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not set" },
      { status: 500 },
    );
  }

  const started = Date.now();
  const spent = () => Date.now() - started;
  const report = {
    added: 0,
    updated: 0,
    credited: 0,
    failed: 0,
    ranOut: false,
  };

  // ---- 1. New titles ------------------------------------------------------
  // One page per region: enough to catch a day's releases without spending
  // the whole budget before any credits get backfilled. The write shape
  // deliberately mirrors scripts/import-tmdb.ts — same stub filter, same
  // `country` from the region, same "never touch a reviewed film" rule — so
  // the cron and the manual importer can't drift into disagreeing.
  try {
    const regions = await importCandidates({ pagesOverride: 1 });

    outer: for (const [region, candidates] of regions) {
      for (const candidate of candidates) {
        if (spent() > BUDGET_MS * 0.6) {
          report.ranOut = true;
          break outer;
        }
        try {
          const existing = await db.film.findUnique({
            where: { kind_tmdbId: { kind: "film", tmdbId: candidate.id } },
          });
          // Never touch a reviewed film: a human wrote that synopsis and set
          // that score, and TMDB's copy would overwrite both.
          if (existing?.reviewed) continue;

          const detail = await fetchFilmDetail(candidate.id);

          // No authorial credit and no runtime means a TMDB data stub rather
          // than a real release.
          if (detail.director === "Unknown" || !detail.runtime) continue;

          const slug =
            existing?.slug ??
            (await uniqueFilmSlug(
              slugify(detail.title, detail.year),
              candidate.id,
            ));

          const data = {
            slug,
            kind: "film",
            tmdbId: detail.tmdbId,
            title: detail.title,
            originalTitle: detail.originalTitle,
            year: detail.year,
            runtime: detail.runtime,
            director: detail.director,
            country: region.label,
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
            report.updated++;
          } else {
            await db.film.create({ data });
            report.added++;
          }
        } catch {
          report.failed++;
        }
      }
    }
  } catch {
    report.failed++;
  }

  // ---- 2. Cast for anything missing it ------------------------------------
  const missing = await db.film.findMany({
    where: { tmdbId: { not: null }, credits: { none: {} } },
    select: { id: true, tmdbId: true, kind: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  for (const film of missing) {
    if (spent() > BUDGET_MS) {
      report.ranOut = true;
      break;
    }
    try {
      const cast = await fetchCast(
        film.tmdbId!,
        film.kind === "series" ? "series" : "film",
      );

      for (const member of cast
        .sort((a, b) => a.order - b.order)
        .slice(0, TOP_BILLED)) {
        let person = await db.person.findUnique({
          where: { tmdbId: member.tmdbId },
        });
        if (!person) {
          const base = personSlug(member.name);
          let slug = base;
          for (
            let n = 2;
            await db.person.findUnique({ where: { slug } });
            n++
          ) {
            slug = `${base}-${n}`;
          }
          person = await db.person.create({
            data: {
              slug,
              tmdbId: member.tmdbId,
              name: member.name,
              profileUrl: member.profileUrl,
            },
          });
        }
        await db.credit.upsert({
          where: { personId_filmId: { personId: person.id, filmId: film.id } },
          create: {
            personId: person.id,
            filmId: film.id,
            character: member.character,
            order: member.order,
          },
          update: { character: member.character, order: member.order },
        });
        report.credited++;
      }
    } catch {
      report.failed++;
    }
  }

  return NextResponse.json({ ok: true, ms: spent(), ...report });
}
