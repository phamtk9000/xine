"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { similarTo } from "@/lib/similar";
import { recommendFor, type Recommendation } from "@/lib/recommend";

export type InterestResult = {
  ok: boolean;
  verdict?: "yes" | "no" | null;
  message?: string;
  /**
   * What takes the answered film's place in the grid.
   *
   * The same field for both verdicts, because the reader's mental model is
   * the same either way: the card they answered goes, and something else
   * arrives in its slot. Only where it is drawn from differs — a yes refills
   * from that film's nearest neighbours, a no refills from anything the
   * recommender likes that is *not* one of them.
   */
  replacement?: Recommendation | null;
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
 *
 * Nothing is revalidated here, and that is the point rather than an
 * oversight. Refreshing the route would rebuild the page under the reader's
 * hands the instant they pressed: the film they just kept would vanish from
 * where they were looking at it and reappear in a strip at the top, and a
 * misfired press would take its own undo button with it. So the write is
 * silent, the button holds the new state, and pressing it again takes it
 * back. The page rearranges on the reader's next visit, when they are not
 * mid-gesture.
 */
export async function setInterest(
  filmId: string,
  verdict: "yes" | "no",
  /**
   * What is currently on screen, so an answer can act on it.
   *
   * Whatever comes back has to avoid everything already on screen, or the
   * slot refills with a film three rows up.
   */
  visible?: string[],
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
    return { ok: true, verdict: null };
  }

  await db.filmFeedback.upsert({
    where: pair,
    create: { userId: user.id, filmId, verdict },
    update: { verdict },
  });

  const onScreen = visible ?? [];

  if (verdict === "yes") {
    // Refill from the film's nearest neighbours: the reader liked this one,
    // so the slot should argue that they will like something next to it.
    const [replacement] = await similarTo(filmId, {
      userId: user.id,
      exclude: onScreen,
      take: 1,
    });
    return { ok: true, verdict, replacement: replacement ?? null };
  }

  // Refill from anywhere except this film's neighbours. A no that produces
  // something visibly similar reads as the page not listening, which is worse
  // than not refilling at all — so the neighbours are excluded by name rather
  // than hoped against.
  const neighbours = await similarTo(filmId, { take: 40 });
  const [replacement] = await recommendFor(user.id, {
    take: 1,
    exclude: [...onScreen, ...neighbours.map((film) => film.id)],
  });

  return { ok: true, verdict, replacement: replacement ?? null };
}
