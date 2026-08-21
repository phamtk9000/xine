import "server-only";
import { db } from "@/lib/db";
import { ARCHETYPES, readTaste, type ArchetypeKey, type Reading } from "@/lib/archetype";
import { averageOverall } from "@/lib/scores";

/**
 * Who else reads the same way.
 *
 * Types are derived on read rather than stored, which means finding everyone
 * of a type is a scan: pull every rater's axes and read them. That is
 * deliberate — a stored type would be wrong the moment somebody's taste moved
 * — and it is fine at this size, but it is the thing to cache first if the
 * community ever gets big. It is a single query and the arithmetic is cheap;
 * the cost is memory, not round trips.
 */

const RATER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  location: true,
  ratings: {
    select: {
      overall: true,
      story: true,
      direction: true,
      visual: true,
      performance: true,
      sound: true,
      film: { select: { year: true } },
    },
  },
} as const;

type Rater = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  ratings: {
    overall: number;
    story: number | null;
    direction: number | null;
    visual: number | null;
    performance: number | null;
    sound: number | null;
    film: { year: number };
  }[];
};

function read(rater: Rater): Reading | null {
  return readTaste(rater.ratings, {
    years: rater.ratings.map((r) => r.film.year),
    average: averageOverall(rater.ratings),
  });
}

export type TypeMember = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  watched: number;
  average: number | null;
  lean: number;
};

/** Everyone who reads as `key`, strongest lean first. */
export async function membersOfType(
  key: ArchetypeKey,
  exclude?: string,
): Promise<TypeMember[]> {
  const raters = (await db.user.findMany({
    select: RATER_SELECT,
    where: { ratings: { some: {} } },
  })) as Rater[];

  return raters
    .flatMap((rater) => {
      const reading = read(rater);
      if (!reading || reading.archetype.key !== key) return [];
      if (exclude && rater.username === exclude) return [];
      return [
        {
          username: rater.username,
          displayName: rater.displayName,
          bio: rater.bio,
          location: rater.location,
          watched: rater.ratings.length,
          average: averageOverall(rater.ratings),
          lean: reading.lean,
        },
      ];
    })
    .sort((a, b) => b.lean - a.lean || b.watched - a.watched);
}

/** How many people fall under each figure. Drives the index page. */
export async function typeCensus(): Promise<
  { key: ArchetypeKey; count: number }[]
> {
  const raters = (await db.user.findMany({
    select: RATER_SELECT,
    where: { ratings: { some: {} } },
  })) as Rater[];

  const tally = new Map<ArchetypeKey, number>();
  for (const rater of raters) {
    const reading = read(rater);
    if (reading) {
      tally.set(
        reading.archetype.key,
        (tally.get(reading.archetype.key) ?? 0) + 1,
      );
    }
  }

  return (Object.keys(ARCHETYPES) as ArchetypeKey[]).map((key) => ({
    key,
    count: tally.get(key) ?? 0,
  }));
}

/** One person's reading, by username. */
export async function readingFor(username: string): Promise<Reading | null> {
  const rater = (await db.user.findUnique({
    where: { username },
    select: RATER_SELECT,
  })) as Rater | null;
  return rater ? read(rater) : null;
}
