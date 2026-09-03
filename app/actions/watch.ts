"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  intentFromAnswers,
  intentSchema,
  type Answers,
  type Intent,
} from "@/lib/rec/intent";
import { interpret, resolveReferences } from "@/lib/rec/interpret";
import {
  accumulate,
  driftFromInterest,
  driftFromRejection,
  type ReasonKey,
} from "@/lib/rec/feedback";
import {
  currentSession,
  logEvent,
  startSession,
  updateSession,
  verdictCount,
  type Session,
} from "@/lib/rec/session";
import { dealDeck, finalistsFrom, type DeckCard } from "@/lib/rec/deck";
import { rebuildTaste } from "@/lib/rec/taste";

/**
 * Everything the recommendation page can ask the server to do.
 *
 * Each action does the same three things in the same order: write what
 * happened, change tonight, deal from the new state. Keeping that order fixed
 * is what makes the page's behaviour describable — a press is never applied
 * to a deck that was ranked before it.
 *
 * None of these actions revalidate a route. The page holds the deck and
 * receives new cards as return values, because rebuilding the page under a
 * reader mid-gesture is the thing that made the earlier version of this feel
 * broken.
 */

export type DeckPayload = {
  sessionId: string;
  cards: PublicCard[];
  chips: { kind: string; key: string; label: string }[];
  confidence: number;
  pool: number;
  verdicts: number;
  askReason: boolean;
  finalists: { safe: PublicCard; xine: PublicCard; wildcard: PublicCard } | null;
};

/**
 * What a card looks like on the client.
 *
 * Deliberately not the internal `Ranked`: the score, the contributions and
 * the profile stay on the server. A reader is owed the reason, not the
 * arithmetic, and shipping the feature weights to the browser would make them
 * an API nobody meant to publish.
 */
export type PublicCard = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  runtime: number | null;
  country: string | null;
  synopsis: string;
  posterUrl: string | null;
  why: string;
};

function toPublic(card: DeckCard): PublicCard {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    year: card.year,
    director: card.director,
    runtime: card.runtime,
    country: card.country,
    synopsis: card.synopsis,
    posterUrl: card.posterUrl,
    why: card.why,
  };
}

/** Ask for a reason after a run of refusals, not after every one. */
const ASK_AFTER = 3;

async function payload(session: Session, cards: DeckCard[], extras: {
  confidence: number;
  pool: number;
}): Promise<DeckPayload> {
  const verdicts = await verdictCount(session.id);
  const { chipsFor } = await import("@/lib/rec/intent");

  return {
    sessionId: session.id,
    cards: cards.map(toPublic),
    chips: chipsFor(session.intent),
    confidence: extras.confidence,
    pool: extras.pool,
    verdicts,
    askReason: verdicts > 0 && verdicts % ASK_AFTER === 0,
    // Three finalists are worth offering once somebody has said enough for
    // them to mean anything. Before that they are three guesses in a row.
    finalists:
      verdicts >= 4 && cards.length >= 3
        ? (() => {
            const three = finalistsFrom(cards);
            return three
              ? {
                  safe: toPublic(three.safe),
                  xine: toPublic(three.xine),
                  wildcard: toPublic(three.wildcard),
                }
              : null;
          })()
        : null,
  };
}

async function sessionFor(answers: Answers, query?: string | null) {
  const existing = await currentSession();
  const chipIntent = intentFromAnswers(answers);

  if (!existing) {
    return startSession(answers, chipIntent);
  }

  // The sentence and the chips both speak. Chips win where they overlap,
  // because they are the thing the reader can see and toggle — an
  // interpretation that cannot be overruled by a visible control is a
  // recommendation engine arguing with its own user.
  const merged: Intent = intentSchema.parse({
    ...existing.intent,
    hard: { ...existing.intent.hard, ...chipIntent.hard },
    soft: { ...existing.intent.soft, ...chipIntent.soft },
    context: { ...existing.intent.context, ...chipIntent.context },
    confidence: Math.max(existing.intent.confidence, chipIntent.confidence),
  });

  await updateSession(existing.id, {
    answers,
    intent: merged,
    ...(query !== undefined ? { query } : {}),
  });
  return { ...existing, answers, intent: merged, query: query ?? existing.query };
}

/** Chips changed: re-intent, re-rank, deal again. */
export async function refine(answers: Answers): Promise<DeckPayload> {
  const session = await sessionFor(answers);
  await logEvent(session.id, "filter_changed", {
    userId: session.userId,
    payload: answers,
  });

  const deck = await dealDeck(session);
  await updateSession(session.id, { confidence: deck.confidence });
  await impressions(session, deck.cards);
  return payload(session, deck.cards, deck);
}

/** A sentence: interpret it, show the reading, deal from it. */
export async function describeEvening(
  text: string,
  answers: Answers,
): Promise<DeckPayload> {
  const trimmed = text.trim().slice(0, 500);
  const session = await sessionFor(answers, trimmed);

  const read = trimmed
    ? await interpret(trimmed)
    : { intent: session.intent, source: "keywords" as const, promptVersion: "none" };

  const resolved = await resolveReferences(read.intent);

  // The chips still win where they disagree: they are what the reader can
  // see and remove.
  const chipIntent = intentFromAnswers(answers);
  const intent: Intent = intentSchema.parse({
    ...resolved,
    hard: { ...resolved.hard, ...chipIntent.hard },
    soft: { ...resolved.soft, ...chipIntent.soft },
    context: { ...resolved.context, ...chipIntent.context },
  });

  await updateSession(session.id, {
    intent,
    query: trimmed,
    promptVersion: read.promptVersion,
  });
  await logEvent(session.id, "natural_query", {
    userId: session.userId,
    payload: { text: trimmed, source: read.source },
    promptVersion: read.promptVersion,
  });

  const withIntent: Session = { ...session, intent, query: trimmed };
  const deck = await dealDeck(withIntent);
  await updateSession(session.id, { confidence: deck.confidence });
  await impressions(withIntent, deck.cards);
  return payload(withIntent, deck.cards, deck);
}

/** Remove one thing the page understood. */
export async function dropChip(
  key: string,
  kind: string,
  answers: Answers,
): Promise<DeckPayload> {
  const session = await currentSession();
  if (!session) return refine(answers);

  const intent: Intent = intentSchema.parse(session.intent);

  if (kind === "soft") delete intent.soft[key as keyof typeof intent.soft];
  if (kind === "context") intent.context = {};
  if (kind === "reference") {
    intent.references = intent.references.filter((r) => r.title !== key);
  }
  if (kind === "hard") {
    if (key === "years") {
      delete intent.hard.yearMin;
      delete intent.hard.yearMax;
    } else if (key.startsWith("excludeGenres:")) {
      const genre = key.split(":")[1];
      intent.hard.excludeGenres = intent.hard.excludeGenres?.filter((g) => g !== genre);
    } else if (key.startsWith("includeGenres:")) {
      const genre = key.split(":")[1];
      intent.hard.includeGenres = intent.hard.includeGenres?.filter((g) => g !== genre);
    } else {
      delete intent.hard[key as keyof typeof intent.hard];
    }
  }

  await updateSession(session.id, { intent });
  const next: Session = { ...session, intent };
  const deck = await dealDeck(next);
  await impressions(next, deck.cards);
  return payload(next, deck.cards, deck);
}

/**
 * A verdict on the card in front of them.
 *
 * The three negatives are three different statements and are stored as three
 * different things. "Not tonight" is an evening's mood and lives only in the
 * session's drift; "never" is a standing instruction and is written to the
 * permanent table; "seen it" is not a negative at all — it removes the film
 * from the deck and teaches nothing, because having seen something says
 * nothing about having liked it.
 */
export async function respond(
  filmId: string,
  verdict: "interested" | "not_tonight" | "never" | "seen" | "save",
  reason?: ReasonKey | null,
): Promise<DeckPayload | null> {
  // A reader can answer the very first card without having touched a chip,
  // and the page deliberately does not create a session during a render — so
  // the first verdict is where one begins.
  const session = (await currentSession()) ?? (await startSession({}, intentFromAnswers({})));

  const user = await getCurrentUser();
  const film = await db.film.findUnique({
    where: { id: filmId },
    select: { id: true },
  });
  if (!film) return null;

  const { profileFor } = await import("@/lib/rec/profile");
  const profile = (await profileFor(filmId)) ?? {};

  let drift = session.drift;
  if (verdict === "interested" || verdict === "save") {
    drift = accumulate(drift, driftFromInterest(profile));
  } else if (verdict === "not_tonight" || verdict === "never") {
    drift = accumulate(drift, driftFromRejection(profile, reason));
  }

  await logEvent(session.id, verdict === "save" ? "save" : verdict, {
    filmId,
    userId: user?.id ?? null,
    reason: reason ?? null,
  });

  if (user) {
    if (verdict === "interested") {
      await db.filmFeedback.upsert({
        where: { userId_filmId: { userId: user.id, filmId } },
        create: { userId: user.id, filmId, verdict: "yes" },
        update: { verdict: "yes", reason: null },
      });
    } else if (verdict === "never") {
      await db.filmFeedback.upsert({
        where: { userId_filmId: { userId: user.id, filmId } },
        create: { userId: user.id, filmId, verdict: "never", reason: reason ?? null },
        update: { verdict: "never", reason: reason ?? null },
      });
    } else if (verdict === "save") {
      await db.watchlistItem
        .create({ data: { userId: user.id, filmId } })
        .catch(() => undefined);
    } else if (verdict === "seen") {
      // Marked watched, and nothing else. "Seen it" is not a judgement — it
      // takes the film out of the deck and leaves the taste profile alone.
      await db.filmLog.upsert({
        where: { userId_filmId: { userId: user.id, filmId } },
        create: { userId: user.id, filmId, watchedAt: new Date() },
        update: { watchedAt: new Date() },
      });
    }
  }

  await updateSession(session.id, { drift });

  const next: Session = { ...session, drift };
  const deck = await dealDeck(next);
  await updateSession(session.id, { confidence: deck.confidence });
  await impressions(next, deck.cards);
  return payload(next, deck.cards, deck);
}

/** Why a reason was given, recorded separately from the verdict it explains. */
export async function giveReason(
  filmId: string,
  reason: ReasonKey,
): Promise<DeckPayload | null> {
  const session = await currentSession();
  if (!session) return null;

  const { profileFor } = await import("@/lib/rec/profile");
  const profile = (await profileFor(filmId)) ?? {};
  const drift = accumulate(session.drift, driftFromRejection(profile, reason));

  await logEvent(session.id, "reason_selected", {
    filmId,
    userId: session.userId,
    reason,
  });
  await updateSession(session.id, { drift });

  const next: Session = { ...session, drift };
  const deck = await dealDeck(next);
  await impressions(next, deck.cards);
  return payload(next, deck.cards, deck);
}

/** The one XINE would choose, and why it is that one. */
export async function pickForMe(): Promise<PublicCard | null> {
  const session = (await currentSession()) ?? (await startSession({}, intentFromAnswers({})));

  const deck = await dealDeck(session, { take: 12 });
  const three = finalistsFrom(deck.cards);
  const chosen = three?.xine ?? deck.cards[0];
  if (!chosen) return null;

  await logEvent(session.id, "pick_for_me", {
    filmId: chosen.id,
    userId: session.userId,
    score: chosen.score,
  });

  return toPublic(chosen);
}

export async function chooseFinalist(filmId: string) {
  const session = await currentSession();
  if (!session) return;
  await logEvent(session.id, "finalist_selected", {
    filmId,
    userId: session.userId,
  });
}

/** Rebuild the permanent profile — after a rating, or on demand. */
export async function refreshTaste() {
  const user = await getCurrentUser();
  if (!user) return;
  await rebuildTaste(user.id);
}

/**
 * Record what was put in front of them.
 *
 * An impression is not a preference, and the ranker never reads these back as
 * one. They exist so that "shown four times, never opened" is answerable
 * later, which is a question no amount of click data can answer on its own.
 */
async function impressions(session: Session, cards: DeckCard[]) {
  await Promise.all(
    cards.slice(0, 3).map((card, index) =>
      logEvent(session.id, "impression", {
        filmId: card.id,
        userId: session.userId,
        rank: index,
        score: card.score,
      }),
    ),
  );
}
