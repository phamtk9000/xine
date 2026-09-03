"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { forgetDimension, rebuildTaste } from "@/lib/rec/taste";

/**
 * Let a reader correct what the recommender has inferred about them.
 *
 * The profile in lib/rec/taste is built entirely from behaviour — ratings,
 * kept and refused suggestions — and behaviour is a noisy signal for taste.
 * Someone who rated three slow films highly because they were the only
 * things worth watching that month is not necessarily someone who loves slow
 * cinema, and there is no way for the system to tell the difference from
 * inside the numbers. The reader can.
 *
 * "Forget" removes the dimension rather than pinning it to a value: the next
 * rating that bears on it starts the inference over, rather than fighting a
 * value the reader has already said is wrong.
 */
export async function forgetTasteDimension(key: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await forgetDimension(user.id, key);
  revalidatePath("/watch/taste");
  return { ok: true };
}

/** Rebuilt from ratings alone — the one operation guaranteed to be correct. */
export async function rebuildTasteFromRatings() {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await rebuildTaste(user.id);
  revalidatePath("/watch/taste");
  return { ok: true };
}
