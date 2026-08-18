"use server";

import { runFinder, type FinderResult } from "@/lib/agent/finder";
import { summariseRecommendations, type Turn } from "@/lib/agent/prompts";

export type FinderState =
  | { status: "idle" }
  | { status: "error"; message: string; turns: Turn[] }
  | ({ status: "done"; turns: Turn[] } & FinderResult);

const MAX_TURNS = 20;

/** The transcript rides in a hidden field — there is no session store. */
function parseTurns(raw: string): Turn[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is Turn =>
          t &&
          (t.role === "user" || t.role === "assistant") &&
          typeof t.text === "string",
      )
      .map((t): Turn => ({ role: t.role, text: t.text.slice(0, 4000) }))
      .slice(-MAX_TURNS);
  } catch {
    return [];
  }
}

export async function findFilmsAction(
  _prev: FinderState,
  formData: FormData,
): Promise<FinderState> {
  const message = String(formData.get("message") ?? "").trim();
  const history = parseTurns(String(formData.get("turns") ?? "[]"));

  if (message.length < 3) {
    return {
      status: "error",
      message: "Say a little more about what you want.",
      turns: history,
    };
  }
  if (message.length > 2000) {
    return {
      status: "error",
      message: "That is longer than it needs to be.",
      turns: history,
    };
  }

  // The API rejects two user turns in a row, which is exactly what a retry
  // after a failure would produce. Drop a trailing user turn before appending.
  const clean =
    history.length > 0 && history[history.length - 1].role === "user"
      ? history.slice(0, -1)
      : history;

  const turns: Turn[] = [...clean, { role: "user", text: message }];

  try {
    const result = await runFinder(turns);

    const assistantText =
      result.kind === "question"
        ? (result.question ?? "")
        : summariseRecommendations(result.picks, result.finalPick);

    const reply: Turn = { role: "assistant", text: assistantText };
    const next = [...turns, reply].slice(-MAX_TURNS);

    return { status: "done", turns: next, ...result };
  } catch (error) {
    // Surface the reason — a missing key, a rate limit and a bad request all
    // need different fixes from whoever is reading this.
    const message =
      error instanceof Error ? error.message : "The programmer failed.";
    return { status: "error", message, turns };
  }
}
