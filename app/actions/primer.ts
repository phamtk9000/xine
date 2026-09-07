"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { agentTurn, type AgentTurn } from "@/lib/rec/agent";
import { interpret } from "@/lib/rec/interpret";
import { chipsFor } from "@/lib/rec/intent";
import { rebuildTaste } from "@/lib/rec/taste";
import type { Vector } from "@/lib/rec/dimensions";

/** How many picks the reading is worth waiting for. Mirrored by the client,
 * which cannot import it from here: a "use server" module may export nothing
 * but async functions. */
const NEEDED = 5;

/**
 * The homepage's twenty-second version of what xine is for.
 *
 * Everything else on the front page explains the site — it is a magazine, a
 * catalogue, a rating system, a recommender. All true, and none of it answers
 * the only question a first-time visitor actually has, which is why they
 * should hand over an email address. This answers it by doing the thing
 * rather than describing it: name five films, and be read.
 *
 * The state of the conversation lives in the browser, not in a session row.
 * Two reasons, and the second is the important one. There is nothing here
 * worth a database write, and a first-time visitor who has not agreed to
 * anything should not be issued an identity in order to look at posters.
 */

/** The opening hand, rendered on the server so the section is not empty. */
export async function openingTurn(): Promise<AgentTurn> {
  return agentTurn({ picked: [], shown: [], needed: NEEDED });
}

/**
 * One move. Everything the agent knows arrives as arguments and leaves as a
 * result, so the same call serves the first pick and the fifth.
 */
export async function nextTurn(state: {
  picked: string[];
  shown: string[];
  stated?: Vector;
}): Promise<AgentTurn> {
  return agentTurn({
    picked: state.picked.slice(0, 8),
    shown: state.shown.slice(-200),
    stated: state.stated ?? {},
    needed: NEEDED,
  });
}

export type Correction = {
  turn: AgentTurn;
  stated: Vector;
  /** What it understood, shown so it can be argued with rather than trusted. */
  chips: { key: string; label: string }[];
  source: "ai" | "keywords";
};

/**
 * "That's not quite right — I like…"
 *
 * The one place a reader can overrule the arithmetic, and it wins outright:
 * four words typed on purpose are better evidence than five posters clicked
 * in twenty seconds, and `believe` weights them accordingly.
 *
 * What it understood comes back as chips rather than being applied silently.
 * A correction that vanishes into a black box and changes the answer for
 * reasons nobody can see is worse than no correction at all — the reader
 * cannot tell a good system from a broken one, so they assume the latter.
 */
export async function correctTaste(
  state: { picked: string[]; shown: string[] },
  text: string,
): Promise<Correction | null> {
  const said = text.trim().slice(0, 400);
  if (said.length < 3) return null;

  const { intent, source } = await interpret(said);
  const stated = intent.soft;

  const turn = await agentTurn({
    picked: state.picked.slice(0, 8),
    shown: state.shown.slice(-200),
    stated,
    needed: NEEDED,
  });

  return {
    turn,
    stated,
    // Reference chips are dropped. In this context the five picks *are* the
    // references, and the keyword reader's habit of finding a film title in
    // "I like these but nothing bleak" produced a chip reading "like these".
    chips: chipsFor(intent)
      .filter((chip) => chip.kind !== "reference")
      .map((chip) => ({ key: chip.key, label: chip.label })),
    source,
  };
}

/**
 * Keep it — the only thing here that writes anything.
 *
 * Explicit on purpose. The earlier version wrote five ratings into a
 * signed-in reader's account the moment the fifth poster was clicked, which
 * meant a page they were playing with silently edited the record the rest of
 * the site reasons from. Nobody asked for that, and the first symptom is a
 * taste page full of films you do not remember rating.
 */
export async function keepTaste(picked: string[]): Promise<{ saved: number } | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const ids = [...new Set(picked)].slice(0, 8);
  if (ids.length === 0) return { saved: 0 };

  const films = await db.film.findMany({ where: { id: { in: ids } }, select: { id: true } });

  await db.$transaction(
    films.map((film) =>
      db.rating.upsert({
        where: { userId_filmId: { userId: user.id, filmId: film.id } },
        // 8.7, not 10: "one of five I love" is a strong signal and not a
        // perfect score, and an account seeded with five tens distorts every
        // average this reader ever contributes to.
        create: { userId: user.id, filmId: film.id, overall: 8.7 },
        update: {},
      }),
    ),
  );

  await rebuildTaste(user.id);
  revalidatePath("/watch/taste");
  revalidatePath("/for-you");

  return { saved: films.length };
}
