/**
 * What each part of the score is worth.
 *
 * In one file, as data, because these are the numbers that will be argued
 * about for the life of the product — and an argument about ranking that has
 * to be conducted by reading a scoring function is an argument nobody wins.
 * Everything the ranker combines appears here with a name and a rationale.
 *
 * Versioned. Every session records which set produced its ordering, so a
 * complaint about recommendations six weeks from now can be traced to the
 * configuration that caused it rather than to a memory of what the code used
 * to do.
 */

export type RankingWeights = {
  version: string;
  session: number;
  taste: number;
  quality: number;
  novelty: number;
  editorial: number;
  serendipity: number;
  /** Named a film to be like — the most specific thing anybody can say. */
  reference: number;
  /** Subtracted, not added: repeats of what was just shown. */
  repetition: number;
};

export const WEIGHTS: RankingWeights = {
  version: "v1",
  /**
   * Tonight outranks everything, because tonight is what was asked. A reader
   * who says "funny, with friends, under two hours" and receives a Hungarian
   * three-hour drama has been told their answers were decorative.
   */
  session: 0.34,
  /**
   * Long-term taste is the tiebreaker, not the brief. It decides between two
   * films that both fit tonight, which is exactly as much authority as a
   * history should have over an evening.
   */
  taste: 0.2,
  /** Rated well, by enough people to mean it. */
  quality: 0.14,
  /** Something they have not seen, and this site has not just shown them. */
  novelty: 0.12,
  /** Written about here, or placed in a list by a person. */
  editorial: 0.1,
  /** Deliberate distance, spent on purpose rather than by accident. */
  serendipity: 0.1,
  /**
   * "Like Burning, but faster" is the most information anybody hands this
   * system in one sentence, and it outranks everything except the evening's
   * own constraints. When no film is named it contributes nothing at all,
   * which is why it can afford to be this loud when one is.
   */
  reference: 0.3,
  repetition: 0.22,
};

/**
 * Bayesian prior for the quality score.
 *
 * Without it, one person's 10/10 outranks fifty thousand people's 8.5, and
 * the deck fills with films nobody has seen and one person adored. The prior
 * is the catalogue's own middle: a film with few votes is pulled toward
 * average until it has earned the right to leave it.
 */
export const QUALITY_PRIOR = { mean: 6.4, votes: 250 };

/** How much a session's own history is allowed to suppress a repeat. */
export const REPEAT_PENALTY = {
  director: 0.55,
  country: 0.18,
  genre: 0.14,
  decade: 0.1,
};

/**
 * Variants, and how a session is assigned one.
 *
 * A ranking change that is not measured is a matter of opinion, and opinions
 * about ranking are unfalsifiable — everybody has an anecdote about a bad
 * recommendation and nobody has a baseline. So a weight change ships as a
 * variant, sessions are split between it and the current configuration, and
 * the event log answers the question afterwards.
 *
 * Bucketing is a hash of the session id: no random calls, no stored
 * assignment, and the same session lands in the same variant on every request
 * — including after a restart, which a coin flip in memory would not manage.
 */
export const VARIANTS: Record<string, RankingWeights> = {
  v1: WEIGHTS,
  /**
   * The evening, louder. Halves the weight of a person's history on the
   * theory that "what you asked for tonight" should almost entirely decide
   * tonight — the open question being whether readers actually want that or
   * only say they do.
   */
  "v1-session-heavy": {
    ...WEIGHTS,
    version: "v1-session-heavy",
    session: 0.44,
    taste: 0.1,
  },
};

/** Which variants are live, and in what proportion. Empty means v1 only. */
const SPLIT: { version: keyof typeof VARIANTS; share: number }[] = [
  { version: "v1", share: 1 },
];

function hash(value: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** The weights this session ranks with. Stable for the life of the session. */
export function weightsFor(sessionId: string): RankingWeights {
  if (!sessionId || SPLIT.length <= 1) return WEIGHTS;

  const roll = hash(sessionId);
  let seen = 0;
  for (const bucket of SPLIT) {
    seen += bucket.share;
    if (roll <= seen) return VARIANTS[bucket.version] ?? WEIGHTS;
  }
  return WEIGHTS;
}
