import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import type { Recommendation } from "@/lib/recommend";

/**
 * "More like that one" — the answer to a press, not to a profile.
 *
 * The recommender in lib/recommend reads a whole account: everything rated,
 * kept and refused, weighted by rarity, held to one film per director. It is
 * the right machine for a page and the wrong one for a gesture. Somebody who
 * has just said yes to Snowpiercer wants to know what that yes bought them,
 * within the second, and the honest answer is small: the films this one is
 * actually next to.
 *
 * Four kinds of neighbour, in the order they are worth saying out loud —
 * sharing an editorial list, a director, a leading actor, or a rare genre
 * from the same cinema. The first is best because a person wrote down why
 * those films belong together; the last is a guess, and is only reached when
 * the others come up empty.
 *
 * Nothing here is scored against a taste vector. Two films sharing a list is
 * a fact about the films, and it stays true whoever pressed the button.
 */

type Neighbour = { id: string; reason: string; rank: number };

const SELECT = {
  id: true,
  slug: true,
  title: true,
  year: true,
  director: true,
  posterUrl: true,
  genres: true,
  criticScore: true,
  tmdbScore: true,
  reviewed: true,
} as const;

export async function similarTo(
  filmId: string,
  options: { userId?: string | null; exclude?: string[]; take?: number } = {},
): Promise<Recommendation[]> {
  const take = options.take ?? 2;

  const film = await db.film.findUnique({
    where: { id: filmId },
    select: {
      id: true,
      title: true,
      director: true,
      genres: true,
      originCountry: true,
    },
  });
  if (!film) return [];

  // Everything already spoken for: judged by this reader, or on screen in
  // front of them. Offering a film that is three rows up is not a suggestion.
  const judged = options.userId
    ? await Promise.all([
        db.rating.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
        db.filmLog.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
        db.watchlistItem.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
        db.filmFeedback.findMany({
          where: { userId: options.userId },
          select: { filmId: true },
        }),
      ])
    : [];

  const skip = new Set<string>([
    filmId,
    ...(options.exclude ?? []),
    ...judged.flat().map((row) => row.filmId),
  ]);

  const found = new Map<string, Neighbour>();
  const note = (id: string, reason: string, rank: number) => {
    if (skip.has(id) || found.has(id)) return;
    found.set(id, { id, reason, rank });
  };

  // 0. The precomputed blend, when this film has one. It agrees with the
  //    signals below often enough that they mostly serve as its fallback —
  //    but it knows things they cannot: that The Grand Budapest Hotel belongs
  //    next to Rushmore, which shares no genre and no cast with it.
  const precomputed = await db.filmNeighbour.findMany({
    where: { filmId, neighbourId: { notIn: [...skip] } },
    orderBy: { score: "desc" },
    take: take * 3,
    select: { neighbourId: true, parts: true },
  });
  for (const row of precomputed) {
    const parts = JSON.parse(row.parts) as Record<string, number>;
    const lead = Object.entries(parts).sort((a, b) => b[1] - a[1])[0]?.[0];
    note(
      row.neighbourId,
      lead === "person"
        ? `Shares its crew with ${film.title}`
        : lead === "cluster"
          ? `Feels like ${film.title}`
          : `Close to ${film.title}`,
      0,
    );
  }

  // 1. Shared editorial list — somebody wrote down why these belong together.
  const lists = await db.listEntry.findMany({
    where: { filmId },
    select: {
      list: {
        select: {
          title: true,
          entries: {
            select: { filmId: true },
            take: 40,
          },
        },
      },
    },
  });
  for (const entry of lists) {
    for (const sibling of entry.list.entries) {
      note(
        sibling.filmId,
        `With ${film.title} in “${entry.list.title}”`,
        1,
      );
    }
  }

  // 2. Same director.
  if (film.director && film.director !== "Unknown") {
    for (const row of await db.film.findMany({
      where: { director: film.director, id: { notIn: [...skip] } },
      orderBy: { tmdbVotes: "desc" },
      take: 4,
      select: { id: true },
    })) {
      note(row.id, `Also directed by ${film.director}`, 2);
    }
  }

  // 3. A leading actor, through the credits table.
  const leads = await db.credit.findMany({
    where: { filmId, order: { lt: 3 } },
    select: { personId: true, person: { select: { name: true } } },
  });
  if (leads.length > 0) {
    for (const credit of await db.credit.findMany({
      where: {
        personId: { in: leads.map((lead) => lead.personId) },
        order: { lt: 3 },
        filmId: { notIn: [...skip] },
      },
      take: 30,
      select: {
        filmId: true,
        personId: true,
        film: { select: { tmdbVotes: true } },
      },
      orderBy: { film: { tmdbVotes: "desc" } },
    })) {
      const person = leads.find((lead) => lead.personId === credit.personId);
      note(
        credit.filmId,
        `With ${person?.person.name}, from ${film.title}`,
        3,
      );
    }
  }

  // 4. The fallback: its rarest genre, from the same cinema. A guess, and
  //    labelled as one rather than dressed up.
  if (found.size < take) {
    const genres = fromCsv(film.genres);
    const home = film.originCountry?.split(",")[0]?.trim();
    if (genres.length > 0) {
      const genre = genres[genres.length - 1];
      for (const row of await db.film.findMany({
        where: {
          genres: { contains: genre },
          ...(home ? { originCountry: { startsWith: home } } : {}),
          id: { notIn: [...skip] },
          posterUrl: { not: null },
        },
        orderBy: [{ criticScore: "desc" }, { tmdbVotes: "desc" }],
        take: 6,
        select: { id: true },
      })) {
        note(row.id, `${genre}, like ${film.title}`, 4);
      }
    }
  }

  const chosen = [...found.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, take * 3);
  if (chosen.length === 0) return [];

  const rows = await db.film.findMany({
    where: { id: { in: chosen.map((n) => n.id) } },
    select: SELECT,
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  return chosen
    .map((neighbour) => {
      const row = byId.get(neighbour.id);
      if (!row) return null;
      return {
        ...row,
        genres: fromCsv(row.genres),
        score: 0,
        reason: neighbour.reason,
      };
    })
    .filter((row): row is Recommendation => row !== null)
    .slice(0, take);
}
