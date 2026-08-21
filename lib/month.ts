import "server-only";
import { db } from "@/lib/db";
import {
  AXES,
  averageAxis,
  averageOverall,
  dominantAxis,
  round1,
  type AxisKey,
} from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";
import { inChunks } from "@/lib/batch";

/**
 * The monthly read on someone's taste.
 *
 * Built from what they actually did rather than anything they declared, and
 * recomputed on every view rather than stored — a cached profile goes stale
 * the moment taste moves, which is exactly when it matters.
 *
 * The thing that makes this worth reading is that xine collects two
 * independent signals about the same film. A rating is a judgement, argued
 * across five axes. A like is a reflex. Most of the time they agree, and the
 * month is unremarkable. Where they *disagree* is the only place a viewer
 * learns something they did not already know about themselves:
 *
 *   - liked, but rated below their own average → a pleasure they can't defend
 *   - rated highly, but never liked           → admired at arm's length
 *
 * Neither is computable from ratings alone, which is the reason the like
 * button exists at all.
 *
 * Month boundaries are UTC. Nothing else in the app is timezone-aware, and a
 * digest that silently shifted by a day depending on where it was opened
 * would be worse than one that is consistently UTC.
 */

export type MonthKey = string; // "2026-08"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthKey(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthRange(key: MonthKey) {
  const [year, month] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

export function shiftMonth(key: MonthKey, by: number): MonthKey {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year, month - 1 + by, 1)));
}

type Entry = {
  slug: string;
  title: string;
  year: number;
  posterUrl: string | null;
  runtime: number | null;
  genres: string[];
  country: string | null;
  director: string;
  liked: boolean;
  mine: number | null;
  room: number | null;
  roomCount: number;
};

export type Dossier = {
  key: MonthKey;
  label: string;
  /** False when the month has nothing in it, so the page can say so plainly. */
  any: boolean;
  counts: { watched: number; liked: number; rated: number; minutes: number };
  headline: string;
  standfirst: string;
  /** What they rewarded this month, and what they usually reward. */
  lean: { label: string; value: number } | null;
  baseline: { label: string; value: number } | null;
  drift: string | null;
  axes: { key: AxisKey; label: string; month: number | null; prior: number | null }[];
  /** Signed mean gap between their scores and the community's. */
  contrarian: { gap: number; sharpest: Entry | null } | null;
  guiltyPleasures: Entry[];
  admired: Entry[];
  decades: { decade: number; count: number }[];
  countries: { name: string; count: number }[];
  directors: { name: string; count: number }[];
  entries: Entry[];
  prescription: {
    slug: string;
    title: string;
    year: number;
    posterUrl: string | null;
    because: string;
  } | null;
};

function tally(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) if (v) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

export async function getDossier(
  userId: string,
  key: MonthKey,
): Promise<Dossier> {
  const { start, end, label } = monthRange(key);

  const [logs, allRatings] = await Promise.all([
    db.filmLog.findMany({
      where: { userId, watchedAt: { gte: start, lt: end } },
      orderBy: { watchedAt: "asc" },
      select: {
        likedAt: true,
        film: {
          select: {
            id: true, slug: true, title: true, year: true, runtime: true,
            genres: true, country: true, director: true, posterUrl: true,
          },
        },
      },
    }),
    // Every rating they have ever left. Split below into this month's and
    // everything before it.
    db.rating.findMany({
      where: { userId },
      select: {
        filmId: true, overall: true, story: true, direction: true,
        visual: true, performance: true, sound: true,
      },
    }),
  ]);

  const filmIds = logs.map((l) => l.film.id);
  const byFilm = new Map(allRatings.map((r) => [r.filmId, r]));

  // One grouped query for the room's average on this month's films, rather
  // than a per-film aggregate in the loop.
  const room = await inChunks(filmIds, (batch) =>
    db.rating.groupBy({
      by: ["filmId"],
      where: { filmId: { in: batch } },
      _avg: { overall: true },
      _count: { overall: true },
    }),
  );
  const roomBy = new Map(room.map((r) => [r.filmId, r]));

  const entries: Entry[] = logs.map((log) => {
    const f = log.film;
    const agg = roomBy.get(f.id);
    return {
      slug: f.slug,
      title: f.title,
      year: f.year,
      posterUrl: f.posterUrl,
      runtime: f.runtime,
      genres: fromCsv(f.genres),
      country: f.country,
      director: f.director,
      liked: !!log.likedAt,
      mine: byFilm.get(f.id)?.overall ?? null,
      room: agg?._avg.overall ?? null,
      roomCount: agg?._count.overall ?? 0,
    };
  });

  // Their own ratings for this month's films only, which is what the lean
  // and the axis table are computed from.
  const monthRatings = filmIds
    .map((id) => byFilm.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const rated = entries.filter((e) => e.mine !== null);
  const myAverage = averageOverall(allRatings);

  // The baseline is what they rated BEFORE this month, not all-time.
  // All-time includes the month itself, which drags the comparison toward
  // zero — and in someone's first month it would be the identical set, so
  // "you usually reward X" would be reading the month back to itself.
  const inMonth = new Set(filmIds);
  const priorRatings = allRatings.filter((r) => !inMonth.has(r.filmId));

  const lean = dominantAxis(monthRatings);
  const base = priorRatings.length ? dominantAxis(priorRatings) : null;

  const axes = AXES.map(({ key: k, label: l }) => ({
    key: k,
    label: l,
    month: averageAxis(monthRatings, k),
    prior: averageAxis(priorRatings, k),
  }));

  // Contrarian index. Only films the room has actually weighed in on — a
  // single other rating is not "the room", so require two.
  const compared = entries.filter(
    (e) => e.mine !== null && e.room !== null && e.roomCount >= 2,
  );
  const contrarian = compared.length
    ? {
        gap: round1(
          compared.reduce((s, e) => s + (e.mine! - e.room!), 0) /
            compared.length,
        ),
        sharpest: compared.reduce((best, e) =>
          Math.abs(e.mine! - e.room!) > Math.abs(best.mine! - best.room!)
            ? e
            : best,
        ),
      }
    : null;

  // Gut against judgement — see the note at the top of this file.
  const floor = myAverage ?? 7;
  const guiltyPleasures = entries
    .filter((e) => e.liked && e.mine !== null && e.mine < floor - 0.3)
    .sort((a, b) => a.mine! - b.mine!)
    .slice(0, 3);
  const admired = entries
    .filter((e) => !e.liked && e.mine !== null && e.mine >= floor + 0.5)
    .sort((a, b) => b.mine! - a.mine!)
    .slice(0, 3);

  const decades = [
    ...entries
      .reduce((m, e) => {
        const d = Math.floor(e.year / 10) * 10;
        return m.set(d, (m.get(d) ?? 0) + 1);
      }, new Map<number, number>())
      .entries(),
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, count }));

  const countries = tally(entries.map((e) => e.country ?? "")).slice(0, 5);
  const directors = tally(entries.map((e) => e.director)).filter(
    (d) => d.count > 1,
  );
  const genres = tally(entries.flatMap((e) => e.genres));

  const counts = {
    watched: entries.length,
    liked: entries.filter((e) => e.liked).length,
    rated: rated.length,
    minutes: entries.reduce((s, e) => s + (e.runtime ?? 0), 0),
  };

  const { headline, standfirst } = write({
    label,
    counts,
    entries,
    genres,
    decades,
    directors,
    contrarian,
    guiltyPleasures,
    admired,
    lean,
    base,
    myAverage,
  });

  return {
    key,
    label,
    any: entries.length > 0,
    counts,
    headline,
    standfirst,
    lean: lean ? { label: lean.label, value: lean.lean } : null,
    baseline: base ? { label: base.label, value: base.lean } : null,
    drift: !lean
      ? null
      : !base
        ? `${lean.label} is what earned your marks this month. Once you have a few months behind you, this will tell you whether that is usual.`
        : lean.key !== base.key
          ? `You usually reward ${base.label}. This month you rewarded ${lean.label}.`
          : `Same as always: ${lean.label} is what earns your marks.`,
    axes,
    contrarian,
    guiltyPleasures,
    admired,
    decades,
    countries,
    directors,
    entries,
    prescription: await prescribe(userId, genres[0]?.name ?? null),
  };
}

/**
 * The headline.
 *
 * Rule-based rather than generated: this runs on every page view, and a
 * sentence that changes wording each time you refresh reads as noise rather
 * than as a verdict. The rules are ordered by how much the finding actually
 * tells you — an unusual pattern outranks a large number.
 */
function write(d: {
  label: string;
  counts: { watched: number; liked: number; rated: number; minutes: number };
  entries: Entry[];
  genres: { name: string; count: number }[];
  decades: { decade: number; count: number }[];
  directors: { name: string; count: number }[];
  contrarian: { gap: number; sharpest: Entry | null } | null;
  guiltyPleasures: Entry[];
  admired: Entry[];
  lean: { key: AxisKey; label: string; lean: number } | null;
  base: { key: AxisKey; label: string; lean: number } | null;
  myAverage: number | null;
}): { headline: string; standfirst: string } {
  const { counts, entries, genres, decades, directors, contrarian } = d;

  if (counts.watched === 0) {
    return {
      headline: "A quiet month",
      standfirst:
        "Nothing logged. Mark a few films watched and this page fills itself in.",
    };
  }

  const hours = Math.round(counts.minutes / 60);
  const older = entries.filter((e) => e.year < 2000).length;
  const oldSkew = older / entries.length;
  const topGenre = genres[0];
  const genreShare = topGenre ? topGenre.count / entries.length : 0;
  const repeatDirector = directors[0];
  const spread = decades.length;

  let headline = `${counts.watched} film${counts.watched === 1 ? "" : "s"} in ${d.label}`;

  if (d.lean && d.base && d.lean.key !== d.base.key) {
    headline = `The month you started watching for ${d.lean.label.toLowerCase()}`;
  } else if (d.guiltyPleasures.length >= 2) {
    headline = "The month your gut overruled your notes";
  } else if (d.admired.length >= 2) {
    headline = "A month of films you respected more than you enjoyed";
  } else if (repeatDirector) {
    headline = `A ${repeatDirector.name} month`;
  } else if (oldSkew >= 0.6) {
    headline = "You spent the month in the past";
  } else if (contrarian && Math.abs(contrarian.gap) >= 1) {
    headline =
      contrarian.gap > 0
        ? "You were the room's soft touch"
        : "You were the hardest marker in the room";
  } else if (genreShare >= 0.5 && topGenre) {
    headline = `${counts.watched} films, and ${topGenre.count} of them ${topGenre.name}`;
  } else if (spread >= 5) {
    headline = "A month with no century in particular";
  }

  const bits: string[] = [];
  bits.push(
    `${counts.watched} watched${hours >= 1 ? `, about ${hours} hour${hours === 1 ? "" : "s"} of screen time` : ""}.`,
  );
  if (counts.liked) {
    bits.push(
      `${counts.liked} of them stayed with you${counts.rated ? `, and you put a number on ${counts.rated}` : ""}.`,
    );
  } else if (counts.rated) {
    bits.push(`You rated ${counts.rated} of them.`);
  }
  if (topGenre && genreShare >= 0.34) {
    bits.push(`${topGenre.name} did most of the work.`);
  }

  return { headline, standfirst: bits.join(" ") };
}

/**
 * One thing to watch next. Reviewed titles only — this is the house
 * recommending, so it should be something the house has actually stood behind
 * — and never something already logged.
 */
async function prescribe(userId: string, genre: string | null) {
  if (!genre) return null;

  const seen = await db.filmLog.findMany({
    where: { userId },
    select: { filmId: true },
  });
  const seenIds = new Set(seen.map((s) => s.filmId));

  // Take the genre's best few and drop the seen ones here, rather than
  // passing every id they have ever logged as a `notIn` — that list only
  // grows, and would eventually blow SQLite's bound-parameter cap on a page
  // that has nothing to do with how much someone has watched.
  const candidates = await db.film.findMany({
    where: {
      reviewed: true,
      criticScore: { not: null },
      genres: { contains: genre },
    },
    orderBy: { criticScore: "desc" },
    take: 50,
    select: { id: true, slug: true, title: true, year: true, posterUrl: true },
  });

  const pick = candidates.find((f) => !seenIds.has(f.id));
  if (!pick) return null;

  return {
    ...pick,
    because: `${genre} took up more of your month than anything else. This is the highest-rated ${genre} title xine has reviewed that you haven't logged.`,
  };
}
