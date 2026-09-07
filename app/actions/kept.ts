"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * What you can do with a film you have already said yes to.
 *
 * The Kept strip inherited the deck's buttons — Interested and Not for me —
 * and neither is a sensible thing to offer about a film already kept. One is
 * a no-op wearing a confusing label and the other asks somebody to contradict
 * a decision they made on purpose. The two useful answers are that you have
 * now watched it, or that you want it off the list.
 *
 * Both remove the keep, and that is the point rather than a side effect: the
 * strip is a holding area, and a film only leaves it by being dealt with.
 */

export async function markKeptWatched(filmId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await db.$transaction([
    // Watching is the outcome the keep existed to produce, so it is recorded
    // as a real one — this shows up in the monthly read and the profile like
    // any other watch, not as a private note on a recommendation.
    db.filmLog.upsert({
      where: { userId_filmId: { userId: user.id, filmId } },
      create: { userId: user.id, filmId, watchedAt: new Date() },
      update: { watchedAt: new Date() },
    }),
    db.filmFeedback.deleteMany({ where: { userId: user.id, filmId } }),
  ]);

  revalidatePath("/for-you");
  revalidatePath("/taste");
  return { ok: true };
}

/**
 * Take it off the list without saying anything about the film.
 *
 * Deliberately not the same as "not for me": removing a keep is housekeeping,
 * and writing it down as a negative preference would teach the recommender
 * that a film somebody was interested in enough to keep is one to avoid.
 */
export async function removeKept(filmId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await db.filmFeedback.deleteMany({ where: { userId: user.id, filmId } });
  revalidatePath("/for-you");
  return { ok: true };
}
