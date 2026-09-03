/**
 * A film as a direction in meaning-space, built from its own words.
 *
 * No embedding service. The hashing trick — hash each token into one of 256
 * buckets, weight it by how rare the token is, normalise — is a 1990s idea
 * that remains a good one for text this short. A synopsis is sixty words; the
 * difference between a real transformer embedding and this on sixty words of
 * plot summary is smaller than the difference between having vectors and not.
 *
 * What it buys is the thing genres cannot express. "Corporate psychopath
 * energy without being a comedy" shares no genre with anything, but it shares
 * vocabulary — boardroom, ambition, ruthless — with a specific dozen films.
 *
 * Deterministic, dependency-free and cheap enough to recompute the whole
 * catalogue in a minute, which matters more than absolute quality: a vector
 * nobody can rebuild is a vector nobody can improve.
 */

/**
 * Buckets, and why this many.
 *
 * At 256 the catalogue's eighty-six thousand words were sharing three hundred
 * and forty to a bucket, and the collisions were louder than the signal:
 * Blade Runner 2049's nearest neighbour was a film called Angels Fallen.
 * A thousand buckets brings that to eighty-odd, which for text this short is
 * the difference between neighbours a person would recognise and noise.
 *
 * The vectors never travel per request — they are compared offline and the
 * results stored — so the cost of a wider vector is disk, which is cheap, and
 * not latency, which is not.
 */
export const DIMS = 1024;
export const MODEL = "hash-tfidf-v2";

/** Words that appear in every synopsis and mean nothing in any of them. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been", "his",
  "her", "their", "its", "he", "she", "they", "it", "who", "that", "this",
  "when", "while", "after", "before", "into", "out", "up", "down", "over",
  "film", "movie", "story", "life", "man", "woman", "young", "new", "one",
  "two", "no", "not", "than", "then", "them", "him", "has", "have", "had",
  "will", "would", "can", "must", "about", "between", "against", "through",
  "synopsis", "available", "yet", "plot", "unknown",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && word.length < 24 && !STOP.has(word));
}

/** FNV-1a, because it is four lines and spreads short strings well. */
function hash(word: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type EmbedInput = {
  title: string;
  originalTitle?: string | null;
  synopsis?: string | null;
  genres?: string | null;
  director?: string | null;
  cast?: string | null;
  country?: string | null;
  year?: number | null;
};

/**
 * The text a film is embedded from, and how much each part counts.
 *
 * Repetition is the weighting: a director's name written three times lands
 * three times in the same bucket. Crude, and exactly as effective here as a
 * separate weight vector would be, with none of the bookkeeping.
 */
export function embedText(film: EmbedInput): string {
  // The synopsis carries the meaning and is weighted accordingly. The
  // director appears once rather than three times: their name is already a
  // first-class signal in the ranker, and repeating it here turned every
  // vector into a filmography lookup — Parasite's nearest neighbours were
  // three other Bong Joon-ho films, which is true, useless, and something
  // the affinity score already says.
  const parts = [
    film.title,
    film.originalTitle ?? "",
    film.genres ?? "",
    film.director ?? "",
    film.country ?? "",
    film.synopsis ?? "",
    film.synopsis ?? "",
  ];
  return parts.join(" ");
}

/**
 * Term frequencies for one film, before rarity is applied.
 *
 * Kept separate from `embed` so a corpus pass can count document frequencies
 * first — the whole point of IDF is that it cannot be known from one row.
 */
export function counts(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const word of tokens(text)) out.set(word, (out.get(word) ?? 0) + 1);
  return out;
}

export type Idf = Map<string, number>;

/** How rare each word is across the catalogue, as a lookup. */
export function buildIdf(documents: Map<string, number>[], total: number): Idf {
  const seen = new Map<string, number>();
  for (const document of documents) {
    for (const word of document.keys()) seen.set(word, (seen.get(word) ?? 0) + 1);
  }

  const idf: Idf = new Map();
  for (const [word, count] of seen) {
    idf.set(word, Math.log((total + 1) / (count + 1)) + 0.2);
  }
  return idf;
}

/**
 * One film's vector: hashed, rarity-weighted, L2-normalised, quantised.
 *
 * The sign of the hash decides the sign of the contribution, which is the
 * standard trick for keeping collisions from systematically inflating a
 * bucket — two unrelated words landing together are as likely to cancel as to
 * add.
 */
export function embed(text: string, idf: Idf | null = null): Int8Array {
  const dense = new Float64Array(DIMS);

  for (const [word, count] of counts(text)) {
    const weight = (1 + Math.log(count)) * (idf?.get(word) ?? 1);
    const h = hash(word);
    const bucket = h % DIMS;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    dense[bucket] += sign * weight;
  }

  let norm = 0;
  for (const value of dense) norm += value * value;
  norm = Math.sqrt(norm) || 1;

  const out = new Int8Array(DIMS);
  for (let i = 0; i < DIMS; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round((dense[i] / norm) * 127)));
  }
  return out;
}

export function encode(vector: Int8Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString(
    "base64",
  );
}

export function decode(encoded: string): Int8Array {
  const buffer = Buffer.from(encoded, "base64");
  return new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Cosine similarity of two quantised vectors, back on a 0–1 scale. */
export function cosine(a: Int8Array, b: Int8Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  // Cosine runs -1..1; the negative half is meaningless for text this sparse,
  // so it is clamped rather than rescaled — a film unlike the query is not
  // "the opposite of" the query, it is simply not a match.
  return Math.max(0, dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

/** The middle of a set of vectors — a taste, or a reference set. */
export function centroid(vectors: Int8Array[]): Int8Array | null {
  if (vectors.length === 0) return null;

  const dense = new Float64Array(DIMS);
  for (const vector of vectors) {
    for (let i = 0; i < DIMS; i++) dense[i] += vector[i];
  }

  let norm = 0;
  for (const value of dense) norm += value * value;
  norm = Math.sqrt(norm) || 1;

  const out = new Int8Array(DIMS);
  for (let i = 0; i < DIMS; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round((dense[i] / norm) * 127)));
  }
  return out;
}
