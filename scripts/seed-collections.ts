import "dotenv/config";
import { db } from "../lib/db";
import { ingestTitle } from "../lib/ingest";
import { searchTitles, tmdbConfigured, type TitleMatch } from "../lib/tmdb";
import { COLLECTIONS, TITLES } from "../prisma/seed-data/collections";

/**
 * Build the editorial collections — ten shelves, seventy-two lists.
 *
 *   npm run lists:seed                 resolve everything and write the lists
 *   npm run lists:seed -- --dry-run    resolve only; report what is missing
 *   npm run lists:seed -- --local-only don't touch TMDB; use the catalogue
 *
 * Two passes, deliberately separate. The first resolves all 344 titles to
 * catalogue rows, pulling anything missing from TMDB; the second writes the
 * lists. Nothing is written until every title in a list has resolved, so a
 * run that dies on call 200 leaves no half-built shelves behind.
 *
 * Idempotent: lists are upserted on slug and their entries are rebuilt in
 * order, so re-running fixes a list rather than duplicating it.
 *
 * Slow by design — roughly two TMDB calls per title that isn't already in the
 * catalogue, paced under the rate limit. The first run takes a few minutes;
 * later ones take seconds because the resolution is cached in the catalogue
 * itself.
 */

const PAUSE_MS = 90; // ~11 req/s, inside TMDB's limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Titles agree when their letters do. Strips diacritics, punctuation and a
 * leading article, so "Amélie" finds "Amelie", "Ocean's Eleven" finds
 * "Oceans Eleven", and "The Killing" finds "Killing".
 */
function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/**
 * The best of TMDB's candidates, or nothing.
 *
 * TMDB ranks a search by popularity inside the year filter, which is fine
 * for a title released this decade and actively misleading for anything
 * older or smaller. Searching "Audition" in 1999 puts a zero-vote release
 * called "Auditions from Beyond" above Miike's film; "The Raid" in 2011
 * returns a documentary about a wartime raid. Taking result zero stocks a
 * list with neither film and reports success.
 *
 * So candidates are scored on the two things that actually identify a film —
 * its name and its year — with the audience size as the tiebreak, and a
 * candidate that matches on neither name nor audience is refused rather
 * than settled for. The name test is deliberately loose at the end
 * (a prefix counts) because TMDB's canonical titles carry subtitles the
 * lists do not: The Raid: Redemption, Glass Onion: A Knives Out Mystery,
 * Birdman or (The Unexpected Virtue of Ignorance).
 */
function pickMatch(
  candidates: TitleMatch[],
  name: string,
  year: number,
): TitleMatch | null {
  const wanted = normalise(name);

  const scored = candidates
    .map((candidate) => {
      const names = [candidate.title, candidate.originalTitle]
        .filter(Boolean)
        .map((value) => normalise(value as string));

      const exact = names.includes(wanted);
      const prefix = names.some((value) => value.startsWith(wanted));
      const drift = candidate.year === null ? 99 : Math.abs(candidate.year - year);

      // A title that agrees on neither the name nor a real audience is not
      // the film, whatever its release date says.
      if (drift > 2) return null;
      if (!exact && !prefix && candidate.voteCount < 100) return null;

      return {
        candidate,
        // Audience is weighted as heavily as the name, on a log scale, and
        // that is deliberate. Normalising away a leading article makes "The
        // Birdman" — a 2014 short with two votes — an *exact* match for
        // "Birdman", which then beat Iñárritu's film on a name-first score
        // because that one only matches as a prefix. Between two titles that
        // both plausibly carry the name, the one tens of thousands of people
        // have rated is the one a reader means.
        score:
          (exact ? 3 : prefix ? 2 : 0) +
          (drift === 0 ? 2 : drift === 1 ? 1 : 0.5) +
          Math.min(Math.log10(candidate.voteCount + 1) / 2, 2),
      };
    })
    .filter((row): row is { candidate: TitleMatch; score: number } => row !== null)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.candidate ?? null;
}

type Resolved = { id: string; slug: string; title: string; year: number };

/** Pull a pinned id into the catalogue and hand back the row it wrote. */
async function ingestPinned(
  name: string,
  year: number,
  tmdbId: number,
  kind: "film" | "series",
  unresolved: string[],
): Promise<Resolved | null> {
  const outcome = await ingestTitle(tmdbId, kind);
  if (!("filmId" in outcome)) {
    unresolved.push(`${name} (${year}) — ${outcome.reason}`);
    return null;
  }
  return db.film.findUnique({
    where: { id: outcome.filmId },
    select: { id: true, slug: true, title: true, year: true },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const localOnly = args.includes("--local-only");

  if (!localOnly && !tmdbConfigured()) {
    console.error(
      "TMDB_API_KEY is not set — run with --local-only to build the lists " +
        "from whatever the catalogue already has.",
    );
    process.exit(1);
  }

  // ---- Pass 1: every title to a catalogue row ----------------------------

  // One read of the catalogue, indexed by normalised title and kind. Both
  // the title and the original title are indexed, so a film catalogued under
  // "Låt den rätte komma in" is still found by its English name and the
  // other way round.
  const rows = await db.film.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      originalTitle: true,
      year: true,
      kind: true,
      tmdbId: true,
    },
  });

  const local = new Map<string, typeof rows>();
  for (const row of rows) {
    for (const name of [row.title, row.originalTitle]) {
      if (!name) continue;
      const key = `${row.kind}:${normalise(name)}`;
      const bucket = local.get(key);
      if (bucket) bucket.push(row);
      else local.set(key, [row]);
    }
  }

  const resolved = new Map<string, Resolved>();
  const unresolved: string[] = [];
  let fromCatalogue = 0;
  let imported = 0;

  console.log(`Resolving ${TITLES.length} titles…`);

  const byTmdbId = new Map(
    rows
      .filter((row) => row.tmdbId !== null)
      .map((row) => [`${row.kind}:${row.tmdbId}`, row]),
  );

  for (const wanted of TITLES) {
    // A pinned id skips name matching on both sides — see SeedTitle.tmdbId.
    if (wanted.tmdbId) {
      const known = byTmdbId.get(`${wanted.kind}:${wanted.tmdbId}`);
      if (known) {
        resolved.set(wanted.name, known);
        fromCatalogue++;
        continue;
      }
      if (localOnly) {
        unresolved.push(`${wanted.name} (${wanted.year})`);
        continue;
      }
      const film = await ingestPinned(wanted.name, wanted.year, wanted.tmdbId, wanted.kind, unresolved);
      await sleep(PAUSE_MS);
      if (film) {
        resolved.set(wanted.name, film);
        imported++;
      }
      continue;
    }

    const key = `${wanted.kind}:${normalise(wanted.name)}`;

    // A year is what tells Solaris (1972) from Solaris (2002). Two years of
    // tolerance covers festival-versus-release dating, which routinely puts
    // a film a year either side of the one everyone remembers.
    const candidates = (local.get(key) ?? []).filter(
      (row) => Math.abs(row.year - wanted.year) <= 2,
    );

    if (candidates.length) {
      // Closest year wins when a title has been catalogued twice.
      const best = candidates.sort(
        (a, b) =>
          Math.abs(a.year - wanted.year) - Math.abs(b.year - wanted.year),
      )[0];
      resolved.set(wanted.name, best);
      fromCatalogue++;
      continue;
    }

    if (localOnly) {
      unresolved.push(`${wanted.name} (${wanted.year})`);
      continue;
    }

    // Not in the catalogue. Ask TMDB, and pick from the field rather than
    // taking the first row — see pickMatch for why that distinction matters.
    try {
      const hit = pickMatch(
        await searchTitles(wanted.name, wanted.kind, wanted.year),
        wanted.name,
        wanted.year,
      );
      await sleep(PAUSE_MS);

      if (!hit) {
        unresolved.push(`${wanted.name} (${wanted.year}) — no TMDB match`);
        continue;
      }

      if (dryRun) {
        imported++;
        console.log(
          `  + ${wanted.name} (${wanted.year}) → ${hit.title} (${hit.year})`,
        );
        continue;
      }

      const outcome = await ingestTitle(hit.tmdbId, wanted.kind, {
        tmdbScore: hit.voteAverage,
        tmdbVotes: hit.voteCount,
      });
      await sleep(PAUSE_MS);

      // `in` rather than a status check: TypeScript will not narrow a
      // discriminated union whose tag is itself a union of literals when the
      // test is a chain of `||`, and the property test is unambiguous.
      if (!("filmId" in outcome)) {
        unresolved.push(`${wanted.name} (${wanted.year}) — ${outcome.reason}`);
        continue;
      }

      const film = await db.film.findUnique({
        where: { id: outcome.filmId },
        select: { id: true, slug: true, title: true, year: true },
      });
      if (!film) {
        unresolved.push(`${wanted.name} (${wanted.year}) — vanished on write`);
        continue;
      }

      resolved.set(wanted.name, film);
      imported++;
      if (imported % 20 === 0) console.log(`  …${imported} pulled from TMDB`);
    } catch (error) {
      unresolved.push(`${wanted.name} (${wanted.year}) — ${error}`);
    }
  }

  console.log(
    `\n${fromCatalogue} already in the catalogue, ${imported} pulled from ` +
      `TMDB, ${unresolved.length} unresolved.`,
  );
  if (unresolved.length) {
    console.log("\nUnresolved:");
    for (const line of unresolved) console.log(`  ! ${line}`);
  }

  if (dryRun) {
    console.log("\n[dry run] nothing written.");
    return;
  }

  // ---- Pass 2: the lists themselves --------------------------------------

  let written = 0;
  let entries = 0;
  const thin: string[] = [];

  for (const collection of COLLECTIONS) {
    for (const [position, list] of collection.lists.entries()) {
      const films = list.films
        .map((name) => resolved.get(name))
        .filter((film): film is Resolved => Boolean(film));

      // A missing title costs the list one entry rather than the whole list.
      if (films.length < list.films.length) {
        thin.push(
          `${list.title} — ${films.length}/${list.films.length} resolved`,
        );
      }
      if (films.length === 0) continue;

      const data = {
        title: list.title,
        description: list.description,
        editorial: true,
        collection: collection.slug,
        position,
      };

      const saved = await db.filmList.upsert({
        where: { slug: list.slug },
        create: { slug: list.slug, ...data },
        update: data,
      });

      // Rebuilt rather than merged: the list is an ordered argument, and a
      // re-run must be able to drop a title as well as add one.
      await db.listEntry.deleteMany({ where: { listId: saved.id } });

      // A title can legitimately appear twice in one list only by mistake —
      // dedupe, because [listId, filmId] is unique and would fail the write.
      const seen = new Set<string>();
      const rowsToWrite = films
        .filter((film) => !seen.has(film.id) && seen.add(film.id))
        .map((film, i) => ({ listId: saved.id, filmId: film.id, position: i }));

      await db.listEntry.createMany({ data: rowsToWrite });
      written++;
      entries += rowsToWrite.length;
    }
  }

  if (thin.length) {
    console.log(`\n${thin.length} lists are short a title:`);
    for (const line of thin) console.log(`  · ${line}`);
  }

  console.log(
    `\nWrote ${written} lists across ${COLLECTIONS.length} collections, ` +
      `${entries} entries.`,
  );
  console.log(`Catalogue: ${await db.film.count()} titles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
