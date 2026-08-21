import "dotenv/config";
import { db } from "../lib/db";
import { fetchCast, tmdbConfigured } from "../lib/tmdb";
import { personSlug } from "../lib/slug";

/**
 * Backfills cast — Person and Credit rows — for every title that has a TMDB
 * id.
 *
 *   npm run credits:import                  every title missing credits
 *   npm run credits:import -- --all         re-fetch titles already done
 *   npm run credits:import -- --limit 50    stop after 50 titles
 *   npm run credits:import -- --dry-run     report only, write nothing
 *
 * Safe to re-run: people are keyed on their global TMDB id and credits on
 * (person, film), so a second pass updates rather than duplicating. By
 * default it skips titles that already have credits, which makes it cheap to
 * run repeatedly as the catalogue grows.
 */

const TOP_BILLED = 15;
/** TMDB allows ~50 requests/second; this is far under, and kind to it. */
const PAUSE_MS = 120;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const refetchAll = args.includes("--all");

function numberArg(flag: string) {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  const value = Number(args[at + 1]);
  return Number.isFinite(value) ? value : null;
}

const limit = numberArg("--limit");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves a person to a stable slug, keyed on their TMDB id.
 *
 * Two different people genuinely share a name (there are several Chris
 * Evanses on TMDB), so a name collision on a *different* tmdbId gets a
 * numeric suffix rather than silently merging two careers into one page.
 */
async function upsertPerson(member: {
  tmdbId: number;
  name: string;
  profileUrl: string | null;
}) {
  const existing = await db.person.findUnique({
    where: { tmdbId: member.tmdbId },
  });
  if (existing) {
    // Refresh the headshot: TMDB adds and replaces these over time.
    if (member.profileUrl && member.profileUrl !== existing.profileUrl) {
      await db.person.update({
        where: { id: existing.id },
        data: { profileUrl: member.profileUrl },
      });
    }
    return existing;
  }

  const base = personSlug(member.name);
  let slug = base;
  for (let n = 2; ; n++) {
    const clash = await db.person.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${base}-${n}`;
  }

  return db.person.create({
    data: {
      slug,
      tmdbId: member.tmdbId,
      name: member.name,
      profileUrl: member.profileUrl,
    },
  });
}

async function main() {
  if (!tmdbConfigured()) {
    console.error("TMDB_API_KEY is not set — see .env");
    process.exit(1);
  }

  const films = await db.film.findMany({
    where: {
      tmdbId: { not: null },
      ...(refetchAll ? {} : { credits: { none: {} } }),
    },
    select: { id: true, tmdbId: true, title: true, kind: true },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(
    `${films.length} title${films.length === 1 ? "" : "s"} to fetch` +
      (refetchAll ? " (--all: including ones already done)" : "") +
      (dryRun ? " — dry run, nothing will be written" : ""),
  );

  let people = 0;
  let credits = 0;
  let failed = 0;

  for (const [index, film] of films.entries()) {
    try {
      const cast = await fetchCast(
        film.tmdbId!,
        film.kind === "series" ? "series" : "film",
      );
      const billed = cast
        .sort((a, b) => a.order - b.order)
        .slice(0, TOP_BILLED);

      if (dryRun) {
        console.log(
          `  ${film.title} — ${billed.length} billed: ` +
            billed
              .slice(0, 3)
              .map((c) => `${c.name}${c.character ? ` as ${c.character}` : ""}`)
              .join(", "),
        );
      } else {
        for (const member of billed) {
          const person = await upsertPerson(member);
          people++;
          await db.credit.upsert({
            where: {
              personId_filmId: { personId: person.id, filmId: film.id },
            },
            create: {
              personId: person.id,
              filmId: film.id,
              character: member.character,
              order: member.order,
            },
            update: {
              character: member.character,
              order: member.order,
            },
          });
          credits++;
        }
      }
    } catch (error) {
      failed++;
      console.warn(
        `  ! ${film.title}: ${(error as Error).message.split("\n")[0]}`,
      );
    }

    if ((index + 1) % 25 === 0) {
      console.log(`  …${index + 1}/${films.length}`);
    }
    await sleep(PAUSE_MS);
  }

  const distinct = dryRun ? 0 : await db.person.count();
  console.log(
    dryRun
      ? "Dry run complete."
      : `Done. ${credits} credits across ${distinct} distinct people` +
          ` (${people} lookups)` +
          (failed ? `, ${failed} title(s) failed` : ""),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
