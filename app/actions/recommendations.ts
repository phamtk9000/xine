"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type InterestResult = {
  ok: boolean;
  verdict?: "yes" | "no" | null;
  message?: string;
};

/**
 * Say yes or no to a suggestion.
 *
 * The recommender could only ever read ratings, which means it only learns
 * from films somebody has already watched — and the whole job of the page is
 * to suggest films they have not. A thumb closes that loop: it is the one
 * piece of evidence a reader can give about a film before seeing it.
 *
 * Pressing the same verdict again clears it, because the only way to undo a
 * misclick otherwise is to press the opposite thing and be wrong on purpose.
 *
 * Kept deliberately separate from Rating. A rating is what somebody thought
 * of a film; this is what they thought of the suggestion. Writing a thumb as
 * a 2/10 would put an opinion of an unseen film into the community score,
 * the taste profile and the archetype — all of which read ratings as
 * judgements of films actually watched.
 */
export async function setInterest(
  filmId: string,
  verdict: "yes" | "no",
): Promise<InterestResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to tune this" };
  if (!filmId) return { ok: false, message: "Missing film" };

  const pair = { userId_filmId: { userId: user.id, filmId } };
  const existing = await db.filmFeedback.findUnique({
    where: pair,
    select: { verdict: true },
  });

  if (existing?.verdict === verdict) {
    await db.filmFeedback.delete({ where: pair });
    revalidatePath("/for-you");
    return { ok: true, verdict: null };
  }

  await db.filmFeedback.upsert({
    where: pair,
    create: { userId: user.id, filmId, verdict },
    update: { verdict },
  });

  revalidatePath("/for-you");
  return { ok: true, verdict };
}
