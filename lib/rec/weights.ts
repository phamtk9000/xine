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
