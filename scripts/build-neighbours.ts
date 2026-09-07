import "dotenv/config";
import { db } from "../lib/db";
import { cosine, decode } from "../lib/rec/embed";
import { fromCsv } from "../lib/serialize";

/**
 * Precompute "films like this one" for every film worth the arithmetic.
 *
 *   npm run films:neighbours                 top 8,000 by reach
 *   npm run films:neighbours -- --take 20000
 *
 * Similarity is a quadratic problem and the catalogue is heading for ninety
 * thousand titles, so this does not try to do all of it. Eight thousand films
 * is thirty-two million comparisons — half a minute — and covers everything
 * anybody is realistically going to ask "more like this" about. The tail is
 * still reachable through genre and people, which is what it was reachable
 * through before.
 *
 * The score blends four signals because no single one is good enough alone:
 *
 *   text      cosine of the hashed TF-IDF vectors. Weak on sixty-word
 *             synopses, but it is the only signal that notices two films are
 *             about the same thing when they share no genre and no crew.
 *   clusters  overlap of editorial cluster membership: what it is like to
 *             sit through, rather than what happens.
 *   genre     the plainest signal, and the one a reader checks first. Jaccard
 *             overlap, so a three-genre film is not a perfect match for a
 *             one-genre film that happens to share one.
 *   people    shared director, cinematographer or composer. Narrow, precise,
 *             and the reason "more like this" ever surprises anybody — but
 *             damped, because one shared name is a hint and not a verdict.
 *   shape     same country and adjacent decade, lightly. Two Hong Kong films
 *             from the nineties have something in common that no synopsis
 *             mentions.
 *
 * Agreement is what makes this work: any one signal produces nonsense
 * regularly, and it is rare for three to produce the same nonsense.
 */

const NEIGHBOURS = 12;
const DEFAULT_TAKE = 8000;

/**
 * What each signal is worth, after watching the first set fail.
 *
 * Genre used to be forty percent of a ten percent term — four percent of the
 * score — which is how Deadwood and Butch Cassidy came back as neighbours of
 * The Wolf of Wall Street. Two westerns and a Wall Street black comedy share
 * a cluster and a decade, and with genre that quiet, nothing outvoted them.
 * It is the most legible signal there is to a reader; it gets its own term.
 *
 * People used to be worth a full point for one shared name, which made every
 * neighbour list a filmography: Wolf of Wall Street returned Killers of the
 * Flower Moon, The Irishman and Silence, all true and all Scorsese, none of
 * them an answer to "what else is like this". A shared director should tilt a
 * ranking, not decide it — see `crewOverlap`.
 */
const WEIGHTS = {
  text: 0.18,
  clusters: 0.2,
  people: 0.16,
  genre: 0.28,
  shape: 0.08,
  /**
   * A tiebreak, not a ranking.
   *
   * With genre weighted properly, Get Out's neighbours became genre-perfect
   * and largely worthless — One Missed Call, Monstrous, The Requin, all
   * Horror/Mystery/Thriller and none of them anything anybody wants next.
   * Similarity says which shelf; this decides which end of it. Deliberately
   * small: a great film that is nothing like the one in hand is still not a
   * neighbour, and the ranker applies quality properly further downstream.
   */
  quality: 0.1,
};

/**
 * A shared name is a hint, not a verdict.
 *
 * One name in common — almost always the director — earns half, and it takes
 * the whole crew agreeing to earn full marks. The old linear count let a
 * single shared director outweigh everything the films were actually about.
 */
function crewOverlap(shared: number) {
  if (shared <= 0) return 0;
  if (shared === 1) return 0.5;
  if (shared === 2) return 0.8;
  return 1;
}

async function write<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    }
  }
}

function overlap(a: Map<string, number>, b: Map<string, number>) {
  let total = 0;
  for (const [key, weight] of a) {
    const other = b.get(key);
    if (other) total += Math.min(weight, other);
  }
  return Math.min(1, total);
}

async function main() {
  const takeArg = process.argv.indexOf("--take");
  const take = takeArg === -1 ? DEFAULT_TAKE : Number(process.argv[takeArg + 1]);

  const films = await db.film.findMany({
    orderBy: { tmdbVotes: "desc" },
    take,
    select: {
      id: true,
      title: true,
      director: true,
      cinematographer: true,
      composer: true,
      country: true,
      year: true,
      genres: true,
      criticScore: true,
      tmdbScore: true,
      tmdbVotes: true,
    },
  });
  console.log(`Comparing ${films.length} films…`);

  const ids = films.map((film) => film.id);

  const [vectorRows, clusterRows] = await Promise.all([
    db.filmEmbedding.findMany({
      where: { filmId: { in: ids } },
      select: { filmId: true, vector: true },
    }),
    db.filmCluster.findMany({
      where: { filmId: { in: ids } },
      select: { filmId: true, cluster: true, weight: true },
    }),
  ]);

  const vectors = new Map(vectorRows.map((row) => [row.filmId, decode(row.vector)]));
  const clusters = new Map<string, Map<string, number>>();
  for (const row of clusterRows) {
    const entry = clusters.get(row.filmId) ?? new Map<string, number>();
    entry.set(row.cluster, row.weight);
    clusters.set(row.filmId, entry);
  }

  const people = films.map((film) =>
    new Set(
      [film.director, film.cinematographer, film.composer].filter(
        (name): name is string => Boolean(name) && name !== "Unknown",
      ),
    ),
  );
  const genres = films.map((film) => new Set(fromCsv(film.genres)));

  // Pulled toward the middle when few people have voted, so a 9.0 from two
  // hundred voters does not outrank an 8.2 from fifty thousand.
  const quality = films.map((film) => {
    const score = film.criticScore ?? film.tmdbScore ?? 6.2;
    const votes = film.criticScore !== null ? 5000 : film.tmdbVotes;
    const bayesian = (score * votes + 6.2 * 400) / (votes + 400);
    return Math.min(1, Math.max(0, (bayesian - 4) / 5));
  });

  await write(() => db.filmNeighbour.deleteMany({}));

  let written = 0;
  const buffer: { filmId: string; neighbourId: string; score: number; parts: string }[] = [];

  for (let i = 0; i < films.length; i++) {
    const film = films[i];
    const vector = vectors.get(film.id);
    const mine = clusters.get(film.id) ?? new Map();

    const scored: { id: string; score: number; parts: Record<string, number> }[] = [];

    for (let j = 0; j < films.length; j++) {
      if (i === j) continue;
      const other = films[j];

      const otherVector = vectors.get(other.id);
      const text = vector && otherVector ? cosine(vector, otherVector) : 0;
      const cluster = overlap(mine, clusters.get(other.id) ?? new Map());

      let shared = 0;
      for (const name of people[i]) if (people[j].has(name)) shared++;
      const person = crewOverlap(shared);

      // Jaccard rather than "how much of mine is in yours": a three-genre
      // film should not count as a perfect match for a one-genre film that
      // happens to share it. Crime/Drama/Comedy against Crime/Western is a
      // partial overlap in both directions, and the score should say so.
      let sharedGenres = 0;
      for (const g of genres[i]) if (genres[j].has(g)) sharedGenres++;
      const union = new Set([...genres[i], ...genres[j]]).size;
      const genre = union === 0 ? 0 : sharedGenres / union;

      const sameCountry = film.country && film.country === other.country ? 1 : 0;
      const nearDecade = Math.abs(film.year - other.year) <= 12 ? 1 : 0;
      const shape = sameCountry * 0.6 + nearDecade * 0.4;

      const score =
        text * WEIGHTS.text +
        cluster * WEIGHTS.clusters +
        person * WEIGHTS.people +
        genre * WEIGHTS.genre +
        shape * WEIGHTS.shape +
        quality[j] * WEIGHTS.quality;

      if (score <= 0.12) continue;
      scored.push({
        id: other.id,
        score,
        parts: { text, cluster, person, genre, shape },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    for (const row of scored.slice(0, NEIGHBOURS)) {
      buffer.push({
        filmId: film.id,
        neighbourId: row.id,
        score: Math.round(row.score * 1000) / 1000,
        parts: JSON.stringify({
          text: Math.round(row.parts.text * 100) / 100,
          cluster: Math.round(row.parts.cluster * 100) / 100,
          person: Math.round(row.parts.person * 100) / 100,
          genre: Math.round(row.parts.genre * 100) / 100,
          shape: Math.round(row.parts.shape * 100) / 100,
        }),
      });
    }

    if (buffer.length >= 2000) {
      await write(() => db.filmNeighbour.createMany({ data: buffer.splice(0) }));
      written += 2000;
      process.stdout.write(`  …${i + 1}/${films.length} films, ${written} rows\n`);
    }
  }

  if (buffer.length > 0) {
    written += buffer.length;
    await write(() => db.filmNeighbour.createMany({ data: buffer }));
  }

  console.log(`Done. ${written} neighbour rows.`);
}

main();
