import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { intentSchema, type Answers, type Intent } from "@/lib/rec/intent";
import { WEIGHTS } from "@/lib/rec/weights";
import type { Vector } from "@/lib/rec/dimensions";

/**
 * Tonight, as a row.
 *
 * A session holds the chips, the sentence, the parsed intent and the drift
 * accumulated from every press since — the whole of "what this evening is
 * about" — and none of it ever reaches the permanent taste profile. That
 * separation is the single most important thing in this subsystem: a person
 * who wants something funny on a Friday is not a person who has stopped
 * liking Tarkovsky, and a recommender that cannot tell those apart destroys
 * its own taste model in a week.
 *
 * Signed-out evenings get a session too, addressed by a cookie. The events
 * they produce are the raw material for every future improvement to ranking,
 * and refusing to record them because nobody logged in would throw away most
 * of the data the system will ever see.
 */

const COOKIE = "xine_rec";
const MAX_AGE = 60 * 60 * 6; // An evening, generously.

export type Session = {
  id: string;
  userId: string | null;
  answers: Answers;
  query: string | null;
  intent: Intent;
  drift: Vector;
  confidence: number;
};

function parse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hydrate(row: {
  id: string;
  userId: string | null;
  answers: string;
  query: string | null;
  intent: string;
  drift: string;
  confidence: number;
}): Session {
  return {
    id: row.id,
    userId: row.userId,
    answers: parse<Answers>(row.answers, {}),
    query: row.query,
    intent: intentSchema.parse(parse<unknown>(row.intent, {})),
    drift: parse<Vector>(row.drift, {}),
    confidence: row.confidence,
  };
}

/**
 * The current session, or a new one.
 *
 * Never throws and never blocks a page: a session that cannot be read is
 * replaced rather than reported, because the alternative is an evening that
 * fails to start over a cookie.
 */
export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (!id) return null;

  const row = await db.recSession.findUnique({ where: { id } });
  return row ? hydrate(row) : null;
}

export async function startSession(answers: Answers, intent: Intent) {
  const user = await getCurrentUser();
  const row = await db.recSession.create({
    data: {
      userId: user?.id ?? null,
      answers: JSON.stringify(answers),
      intent: JSON.stringify(intent),
      confidence: intent.confidence,
      modelVersion: WEIGHTS.version,
    },
  });

  const store = await cookies();
  store.set(COOKIE, row.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  return hydrate(row);
}

export async function updateSession(
  id: string,
  patch: Partial<{
    answers: Answers;
    query: string | null;
    intent: Intent;
    drift: Vector;
    confidence: number;
    promptVersion: string;
  }>,
) {
  await db.recSession.update({
    where: { id },
    data: {
      ...(patch.answers ? { answers: JSON.stringify(patch.answers) } : {}),
      ...(patch.query !== undefined ? { query: patch.query } : {}),
      ...(patch.intent ? { intent: JSON.stringify(patch.intent) } : {}),
      ...(patch.drift ? { drift: JSON.stringify(patch.drift) } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.promptVersion ? { promptVersion: patch.promptVersion } : {}),
    },
  });
}

export type EventType =
  | "impression"
  | "open"
  | "interested"
  | "not_tonight"
  | "never"
  | "seen"
  | "save"
  | "more_like_this"
  | "less_like_this"
  | "reason_selected"
  | "filter_changed"
  | "natural_query"
  | "finalist_selected"
  | "pick_for_me";

/**
 * Record what happened, with enough context to be readable later.
 *
 * The rank and the score matter as much as the verdict: "said no" teaches
 * nothing without "to the third card, which scored 0.71". Written without
 * awaiting where the caller is mid-gesture — a log must never be the reason a
 * card feels slow — and failures are swallowed, because a lost event is a
 * small loss and a broken press is not.
 */
export async function logEvent(
  sessionId: string,
  type: EventType,
  data: {
    filmId?: string | null;
    userId?: string | null;
    rank?: number;
    score?: number;
    reason?: string | null;
    payload?: unknown;
    promptVersion?: string;
  } = {},
) {
  try {
    await db.recEvent.create({
      data: {
        sessionId,
        type,
        filmId: data.filmId ?? null,
        userId: data.userId ?? null,
        rank: data.rank,
        score: data.score,
        reason: data.reason ?? null,
        payload: data.payload ? JSON.stringify(data.payload) : null,
        modelVersion: WEIGHTS.version,
        promptVersion: data.promptVersion,
      },
    });
  } catch {
    // An evening is not worth interrupting over an analytics row.
  }
}

/** Films this session has already dealt, so the deck never repeats itself. */
export async function shownIn(sessionId: string): Promise<string[]> {
  if (!sessionId) return [];
  const rows = await db.recEvent.findMany({
    where: { sessionId, filmId: { not: null } },
    select: { filmId: true },
  });
  return [...new Set(rows.map((row) => row.filmId!).filter(Boolean))];
}

/** How many judgements this session has made, for the follow-up triggers. */
export async function verdictCount(sessionId: string) {
  return db.recEvent.count({
    where: { sessionId, type: { in: ["interested", "not_tonight", "never"] } },
  });
}
