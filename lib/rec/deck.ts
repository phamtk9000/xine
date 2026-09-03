import "server-only";
import { applyDrift } from "@/lib/rec/feedback";
import { intentSchema, type Intent } from "@/lib/rec/intent";
import { confidenceOf, judgedBy, poolFor, rank, EMPTY_TASTE, type Ranked } from "@/lib/rec/rank";
import { weightsFor } from "@/lib/rec/weights";
import { tasteFor } from "@/lib/rec/taste";
import { shownIn, type Session } from "@/lib/rec/session";
import { db } from "@/lib/db";
import type { Vector } from "@/lib/rec/dimensions";

/**
 * The deck for a session, dealt from the current state of tonight.
 *
 * Everything upstream of here is state; this is the one function that turns
 * it into films. It is called again after every press, and that is the point:
 * a press changes the drift, the drift changes the intent, and the next card
 * comes from a ranking that already knows what was just said. Nothing is
 * cached between calls except the profiles, because a stale deck is exactly
 * the failure the feedback loop exists to prevent.
 */

export type DeckCard = Ranked & { why: string };

/**
 * Films near the ones the reader named, from the precomputed table.
 *
 * "Like Burning but faster" is two instructions: the second is a nudge on a
 * dimension, and the first is a set of films. Reading that set from a table
 * rather than computing it here is what makes a named film affordable inside
 * a ranking that runs on every press.
 *
 * `avoid` inverts: a film the reader ruled out pushes its neighbours down
 * rather than pulling them up, because "not like that" is as specific a
 * statement as its opposite.
 */
async function nearReferences(intent: Intent): Promise<Map<string, number>> {
  const near = new Map<string, number>();
  const named = intent.references.filter((reference) => reference.filmId);
  if (named.length === 0) return near;

  const rows = await db.filmNeighbour.findMany({
    where: { filmId: { in: named.map((reference) => reference.filmId!) } },
    select: { filmId: true, neighbourId: true, score: true },
  });

  for (const row of rows) {
    const reference = named.find((entry) => entry.filmId === row.filmId);
    if (!reference) continue;
    const sign = reference.relation === "avoid" ? -1 : 1;
    const value = row.score * reference.weight * sign;
    near.set(row.neighbourId, (near.get(row.neighbourId) ?? 0) + value);
  }

  // Scaled against the best neighbour rather than used raw. The blended
  // similarity rarely exceeds a third even for an obvious match — Parasite's
  // closest film scores 0.34 — so used as-is it contributed a rounding error
  // to a score dominated by everything else, and "like Parasite" changed
  // almost nothing. What matters is the ordering within the named film's own
  // neighbours, and that survives the scaling intact.
  const peak = Math.max(...[...near.values()].map(Math.abs), 0.001);
  for (const [id, value] of near) near.set(id, value / peak);

  return near;
}

/**
 * What "but faster" means, on top of what "like Burning" means.
 *
 * The relation carries a nudge of its own: a reader asking for a lighter
 * version of a film they named is describing a direction, and the ranking has
 * a dimension for exactly that. Small on purpose — the named film is doing
 * most of the work.
 */
const RELATION_NUDGE: Record<string, Vector> = {
  similar_but_faster: { pace: 0.78 },
  similar_but_lighter: { weight: 0.3, darkness: 0.3 },
  similar_but_darker: { darkness: 0.82 },
  similar_but_less_violent: { violence: 0.15 },
  similar_but_more_emotional: { weight: 0.8 },
};

function withRelations(intent: Intent): Intent {
  const soft = { ...intent.soft };
  for (const reference of intent.references) {
    const nudge = RELATION_NUDGE[reference.relation];
    if (!nudge) continue;
    for (const [key, value] of Object.entries(nudge)) {
      soft[key as keyof Vector] = value;
    }
  }
  return { ...intent, soft };
}



/**
 * A deck for a reader who has not started a session yet.
 *
 * The first paint should be films, not a spinner — but a session cannot be
 * created during a render, because only an action may set the cookie that
 * addresses one. So the page ranks without one, and the first press creates
 * the session it belongs to. Nothing is lost: the ranking is the same
 * function, and the events start the moment there is something to record.
 */
export async function previewDeck(
  intentIn: Intent,
  userId: string | null,
  take = 12,
) {
  const intent = intentSchema.parse(intentIn);
  const [taste, judged] = await Promise.all([
    userId ? tasteFor(userId) : Promise.resolve(EMPTY_TASTE),
    userId ? judgedBy(userId) : Promise.resolve([]),
  ]);

  const withNudges = withRelations(intent);
  const [{ pool, profiles }, near] = await Promise.all([
    poolFor(withNudges, judged),
    nearReferences(withNudges),
  ]);
  // No session yet, so no variant: the first paint always uses the default
  // configuration. Which is correct rather than convenient — a reader who is
  // bucketed into a variant should see it from their first press, not from a
  // page that was ranked before they had an identity.
  const ranked = rank(pool, profiles, withNudges, taste, { take, near });

  return {
    cards: ranked.map((film) => ({ ...film, why: explain(film, intent, taste) })),
    confidence: confidenceOf(ranked, intent),
    pool: pool.length,
  };
}

export async function dealDeck(
  session: Session,
  options: { take?: number } = {},
): Promise<{ cards: DeckCard[]; confidence: number; pool: number }> {
  const take = options.take ?? 12;

  // Tonight, as amended by everything said since it was parsed.
  const intent: Intent = intentSchema.parse({
    ...session.intent,
    soft: applyDrift(session.intent.soft, session.drift),
  });

  const [taste, judged, shown] = await Promise.all([
    session.userId ? tasteFor(session.userId) : Promise.resolve(EMPTY_TASTE),
    session.userId ? judgedBy(session.userId) : Promise.resolve([]),
    shownIn(session.id),
  ]);

  const exclude = [...new Set([...judged, ...shown, ...(intent.hard.excludeFilmIds ?? [])])];
  const withNudges = withRelations(intent);
  const [{ pool, profiles }, near] = await Promise.all([
    poolFor(withNudges, exclude),
    nearReferences(withNudges),
  ]);

  const ranked = rank(pool, profiles, withNudges, taste, {
    take,
    near,
    weights: weightsFor(session.id),
  });

  return {
    cards: ranked.map((film) => ({ ...film, why: explain(film, intent, taste) })),
    confidence: confidenceOf(ranked, intent),
    pool: pool.length,
  };
}

/**
 * Why this film, from the numbers that actually chose it.
 *
 * Written from the contributions rather than generated, which is a constraint
 * worth keeping even once a language model is doing the phrasing: an
 * explanation that is not derived from the ranking is a plausible sentence
 * about a decision that was made for other reasons, and a reader who catches
 * one stops believing all of them.
 *
 * "97% match" is the thing being avoided. A number says the system is
 * confident; a sentence says what it noticed.
 */
export function explain(
  film: Ranked,
  intent: Intent,
  taste: { directors: Map<string, number> },
): string {
  const parts: [keyof typeof film.contributions, number][] = Object.entries(
    film.contributions,
  ).filter(([key]) => key !== "repetition") as [
    keyof typeof film.contributions,
    number,
  ][];

  parts.sort((a, b) => b[1] - a[1]);
  const lead = parts[0]?.[0];

  const director = taste.directors.get(film.director) ?? 0;
  if (director > 0.5) return `From ${film.director}, who you rate highly.`;

  // A named film beats a dimension even when it contributes less arithmetic.
  // "Close to The Grand Budapest Hotel" is a reason somebody can check;
  // "matches what you asked for: something beautiful" is true of nine
  // thousand films, and the reader named one.
  if (film.contributions.reference > 0.05 || lead === "reference") {
    const named = intent.references[0];
    if (named) {
      return named.relation === "similar"
        ? `Close to ${named.title}.`
        : `${named.title}, in the direction you asked for.`;
    }
  }

  if (lead === "session") {
    const asked = strongestAsk(intent);
    if (asked) return `Matches what you asked for: ${asked.toLowerCase()}.`;
  }

  if (lead === "serendipity") {
    return "Outside your usual, but built from the same things you like.";
  }

  if (lead === "editorial" || film.reviewed) {
    return "Written about by xine, and it fits tonight.";
  }

  if (lead === "novelty" && (film.profile.familiarity ?? 0) > 0.7) {
    return "Barely seen, and close to what you asked for.";
  }

  if (lead === "quality") {
    return "One of the best-rated things that fits tonight.";
  }

  const asked = strongestAsk(intent);
  return asked ? `Close to ${asked.toLowerCase()}.` : "Close to what you asked for.";
}

/** The dimension tonight cares most about, in words. */
function strongestAsk(intent: Intent): string | null {
  let best: { key: string; distance: number; value: number } | null = null;
  for (const [key, value] of Object.entries(intent.soft)) {
    if (value === undefined) continue;
    const distance = Math.abs(value - 0.5);
    if (!best || distance > best.distance) best = { key, distance, value };
  }
  if (!best || best.distance < 0.15) return null;

  const words: Record<string, [string, string]> = {
    pace: ["Something slow", "Something fast"],
    weight: ["Something light", "Something heavy"],
    accessibility: ["Something easy", "Something demanding"],
    realism: ["Something grounded", "Something fantastical"],
    dialogue: ["Something visual", "Something talkative"],
    story: ["Character-led", "Plot-driven"],
    darkness: ["Something comforting", "Something bleak"],
    familiarity: ["Something well known", "Something hidden"],
    weirdness: ["Something conventional", "Something strange"],
    beauty: ["Something plain", "Something beautiful"],
    humour: ["Something serious", "Something funny"],
    tension: ["Something calm", "Something tense"],
    romance: ["No romance", "Something romantic"],
    violence: ["Low violence", "Something violent"],
  };

  const pair = words[best.key];
  if (!pair) return null;
  return best.value >= 0.5 ? pair[1] : pair[0];
}

/**
 * Three ways of being right, once the deck knows enough.
 *
 * Safe is the highest expected satisfaction. XINE's pick balances tonight
 * against what this site actually believes about films. The wildcard is
 * deliberate distance. They are drawn from different parts of the ranking on
 * purpose — three films that agree with each other is not a choice, it is the
 * same recommendation printed three times.
 */
export type Finalists = {
  safe: DeckCard;
  xine: DeckCard;
  wildcard: DeckCard;
};

export function finalistsFrom(cards: DeckCard[]): Finalists | null {
  if (cards.length < 3) return null;

  const safe = [...cards].sort(
    (a, b) =>
      b.contributions.taste + b.contributions.quality -
      (a.contributions.taste + a.contributions.quality),
  )[0];

  const xine =
    [...cards].sort(
      (a, b) =>
        b.contributions.editorial + b.score - (a.contributions.editorial + a.score),
    )[0] ?? cards[0];

  const wildcard = [...cards].sort(
    (a, b) =>
      b.contributions.serendipity + b.contributions.novelty -
      (a.contributions.serendipity + a.contributions.novelty),
  )[0];

  // Three of the same film is not a choice. Fall back down the ranking until
  // the three are distinct.
  const chosen = new Map<string, DeckCard>();
  for (const card of [safe, xine, wildcard]) {
    if (!chosen.has(card.id)) chosen.set(card.id, card);
  }
  for (const card of cards) {
    if (chosen.size >= 3) break;
    if (!chosen.has(card.id)) chosen.set(card.id, card);
  }

  const [first, second, third] = [...chosen.values()];
  if (!first || !second || !third) return null;
  return { safe: first, xine: second, wildcard: third };
}

/** A film by id, in the deck's shape — for the finalists and Pick for me. */
export async function cardById(id: string) {
  return db.film.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      year: true,
      director: true,
      runtime: true,
      country: true,
      synopsis: true,
      posterUrl: true,
    },
  });
}
