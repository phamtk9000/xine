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
 *   people    shared director, cinematographer or composer. Narrow, precise,
 *             and the reason "more like this" ever surprises anybody.
 *   shape     same country and adjacent decade, lightly. Two Hong Kong films
 *             from the nineties have something in common that no synopsis
 *             mentions.
 *
 * Agreement is what makes this work: any one signal produces nonsense
 * regularly, and it is rare for three to produce the same nonsense.
 */

const NEIGHBOURS = 12;
const DEFAULT_TAKE = 8000;

const WEIGHTS = { text: 0.34, clusters: 0.3, people: 0.26, shape: 0.1 };

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
      const person = Math.min(1, shared / 2);

      const sameCountry = film.country && film.country === other.country ? 1 : 0;
      const nearDecade = Math.abs(film.year - other.year) <= 12 ? 1 : 0;
      let sharedGenres = 0;
      for (const genre of genres[i]) if (genres[j].has(genre)) sharedGenres++;
      const shape =
        (sameCountry * 0.4 +
          nearDecade * 0.2 +
          Math.min(1, sharedGenres / Math.max(1, genres[i].size)) * 0.4);

      const score =
        text * WEIGHTS.text +
        cluster * WEIGHTS.clusters +
        person * WEIGHTS.people +
        shape * WEIGHTS.shape;

      if (score <= 0.12) continue;
      scored.push({ id: other.id, score, parts: { text, cluster, person, shape } });
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
