import "server-only";
import { db } from "@/lib/db";
import { fromCsv } from "@/lib/serialize";
import { round1 } from "@/lib/scores";

/**
 * Recommendations, from the one signal this site has that others do not.
 *
 * There is nothing here to train. Forty-one ratings across four accounts is
 * not a matrix anybody can factorise, and per-film axis data exists for about
 * thirty titles — a model fitted to that would produce noise wearing a
 * confident face. Sparsity is not a problem to be modelled around; it is a
 * fact to design for.
 *
 * What xine has instead is seventy-eight lists in which a person placed eight
 * films next to each other and said why. That is a hand-built similarity
 * graph with the edges labelled: In the Mood for Love and Her are adjacent
 * because somebody argued they are both about people who never say it. So
 * the strongest recommender available reads that graph outward from what
 * somebody already loves, and the explanation is not generated — it is the
 * name of the argument that connects the two films.
 *
 * Three weaker signals fill in behind it: directors they rate highly, genres
 * they return to, and a quality prior for the tail. Every one of them is a
 * fact from a row, which is why every recommendation can say what it is for.
 */

export type Recommendation = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  posterUrl: string | null;
  genres: string[];
  criticScore: number | null;
  tmdbScore: number | null;
  reviewed: boolean;
  score: number;
  /** Why this film, in the site's own terms. Never generated prose. */
  reason: string;
};

/**
 * A film in many lists is a hub, not a match — damp it or The Godfather
 * wins every recommendation on the site.
 *
 * The exponent is deliberately gentler than a square root. At 0.5, being in
 * one list beat being in four so heavily that Playtime outranked Her for a
 * reader whose favourite film is In the Mood for Love — obscurity was being
 * rewarded as if it were relevance. At 0.35 hubs are still held back, but a
 * film that genuinely belongs in several of these arguments is allowed to
 * say so.
 */
function damp(listCount: number) {
  return 1 / Math.pow(Math.max(1, listCount), 0.35);
}

/** Ratings this high are treated as a preference rather than a record. */
const LOVED = 7.5;
/** Below this, a rating is evidence *against* the things it resembles. */
const DISLIKED = 5.5;

/** Nobody wants a page of one director, however well it scores. */
const MAX_PER_DIRECTOR = 2;
/** Or a page that is one editorial list read out loud. */
const MAX_PER_LIST = 2;

export async function recommendFor(
  userId: string,
  options: { take?: number } = {},
): Promise<Recommendation[]> {
  const take = options.take ?? 12;

  const [ratings, logs, watchlist] = await Promise.all([
    db.rating.findMany({
      where: { userId },
      select: {
        overall: true,
        film: {
          select: { id: true, title: true, director: true, genres: true },
        },
      },
    }),
    db.filmLog.findMany({
      where: { userId },
      select: { filmId: true, likedAt: true },
    }),
    db.watchlistItem.findMany({ where: { userId }, select: { filmId: true } }),
  ]);

  // Anything they have rated, watched or saved is not a recommendation: the
  // first two they have already judged, and the third they have already
  // decided about.
  const seen = new Set<string>([
    ...ratings.map((r) => r.film.id),
    ...logs.map((l) => l.filmId),
    ...watchlist.map((w) => w.filmId),
  ]);

  const loved = ratings.filter((r) => r.overall >= LOVED);
  const disliked = ratings.filter((r) => r.overall <= DISLIKED);

  // Cold start. Under three ratings there is no taste to read, and guessing
  // from one is worse than admitting it — the caller shows editorial picks.
  if (loved.length === 0) return [];

  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  /** Which list argued for each film, for the diversity pass below. */
  const viaList = new Map<string, string>();

  const add = (
    filmId: string,
    weight: number,
    reason: string,
    listId?: string,
  ) => {
    const next = (scores.get(filmId) ?? 0) + weight;
    scores.set(filmId, next);
    // The reason kept is the one from the strongest single contribution, so
    // a film recommended for three reasons still says the best of them.
    if (!reasons.has(filmId) || weight > (scores.get(`${filmId}:best`) ?? 0)) {
      reasons.set(filmId, reason);
      scores.set(`${filmId}:best`, weight);
      if (listId) viaList.set(filmId, listId);
    }
  };

  // ---- 1. The editorial graph -------------------------------------------
  // Films that share a list with something they loved, weighted by how much
  // they loved it and damped by how many lists the candidate appears in.
  const lovedIds = loved.map((r) => r.film.id);
  const byId = new Map(loved.map((r) => [r.film.id, r]));

  if (lovedIds.length > 0) {
    const entries = await db.listEntry.findMany({
      where: { film: { id: { in: lovedIds } } },
      select: { filmId: true, list: { select: { id: true, title: true } } },
    });

    const listIds = [...new Set(entries.map((e) => e.list.id))];
    const neighbours = await db.listEntry.findMany({
      where: { listId: { in: listIds } },
      select: { filmId: true, listId: true },
    });

    // How many editorial lists each candidate belongs to overall.
    const membership = new Map<string, number>();
    for (const row of await db.listEntry.groupBy({
      by: ["filmId"],
      where: { filmId: { in: neighbours.map((n) => n.filmId) } },
      _count: { _all: true },
    })) {
      membership.set(row.filmId, row._count._all);
    }

    const listTitle = new Map(entries.map((e) => [e.list.id, e.list.title]));
    const sourceOf = new Map<string, string[]>();
    for (const entry of entries) {
      sourceOf.set(entry.list.id, [
        ...(sourceOf.get(entry.list.id) ?? []),
        entry.filmId,
      ]);
    }

    for (const neighbour of neighbours) {
      if (seen.has(neighbour.filmId)) continue;

      const sources = sourceOf.get(neighbour.listId) ?? [];
      for (const sourceId of sources) {
        const source = byId.get(sourceId);
        if (!source) continue;

        const weight =
          (source.overall / 10) * damp(membership.get(neighbour.filmId) ?? 1) * 3;

        add(
          neighbour.filmId,
          weight,
          `With ${source.film.title} in “${listTitle.get(neighbour.listId)}”`,
          neighbour.listId,
        );
      }
    }
  }

  // ---- 2. Directors they reward ------------------------------------------
  const lovedDirectors = [
    ...new Set(loved.map((r) => r.film.director).filter((d) => d !== "Unknown")),
  ];

  if (lovedDirectors.length > 0) {
    const byDirector = await db.film.findMany({
      where: { director: { in: lovedDirectors }, id: { notIn: [...seen] } },
      select: { id: true, director: true },
      take: 120,
    });

    for (const film of byDirector) {
      add(film.id, 1.2, `Also directed by ${film.director}`);
    }
  }

  // ---- 3. Genres they return to ------------------------------------------
  const genreWeight = new Map<string, number>();
  for (const rating of loved) {
    for (const genre of fromCsv(rating.film.genres)) {
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + rating.overall / 10);
    }
  }
  for (const rating of disliked) {
    for (const genre of fromCsv(rating.film.genres)) {
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) - 0.5);
    }
  }

  const topGenres = [...genreWeight.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre);

  // ---- Assemble ----------------------------------------------------------
  const candidateIds = [...scores.keys()].filter((key) => !key.includes(":"));
  if (candidateIds.length === 0) return [];

  const films = await db.film.findMany({
    where: { id: { in: candidateIds } },
    select: {
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
    },
  });

  const ranked = films
    .map((film) => {
      const genres = fromCsv(film.genres);
      const genreBonus = genres.filter((g) => topGenres.includes(g)).length * 0.4;
      // A quality prior for the tail only — enough to break ties, never
      // enough to put a film here that nothing else argued for.
      const quality = ((film.criticScore ?? film.tmdbScore ?? 5) / 10) * 0.8;

      return {
        ...film,
        genres,
        score: round1((scores.get(film.id) ?? 0) + genreBonus + quality),
        reason: reasons.get(film.id) ?? "Close to what you rate highly",
      };
    })
    .sort((a, b) => b.score - a.score);

  // Diversity pass: a page of one director is a worse answer than a slightly
  // lower-scoring one that shows somebody something new.
  const perDirector = new Map<string, number>();
  const perList = new Map<string, number>();
  const out: Recommendation[] = [];

  for (const film of ranked) {
    const directorCount = perDirector.get(film.director) ?? 0;
    if (directorCount >= MAX_PER_DIRECTOR) continue;

    // Capping the source list matters as much as capping the director: the
    // first cut of this page opened with three films from "Architecture as
    // Character", which reads as one shelf rather than a reading of taste.
    const list = viaList.get(film.id);
    const listCount = list ? (perList.get(list) ?? 0) : 0;
    if (list && listCount >= MAX_PER_LIST) continue;

    perDirector.set(film.director, directorCount + 1);
    if (list) perList.set(list, listCount + 1);

    out.push(film);
    if (out.length >= take) break;
  }

  return out;
}

/**
 * What to show somebody the recommender cannot read yet.
 *
 * Not a silent empty state and not a guess: the films this site has actually
 * written about, which is the honest answer to "we don't know you yet".
 */
export async function editorialPicks(take = 12) {
  const films = await db.film.findMany({
    where: { reviewed: true, criticScore: { not: null } },
    orderBy: { criticScore: "desc" },
    take,
    select: {
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
    },
  });

  return films.map((film) => ({
    ...film,
    genres: fromCsv(film.genres),
    score: film.criticScore ?? 0,
    reason: "Written about by xine",
  }));
}
