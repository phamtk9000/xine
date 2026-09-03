"use server";

import { revalidatePath } from "next/cache";
import { adopt } from "@/lib/catalogue-pick";
import type { FilmPick } from "@/lib/catalogue-pick";

/**
 * Turn a TMDB search result into a row in this catalogue, from the browser.
 *
 * The moment somebody acts on a title — opens it, or puts it in a list — is
 * the moment it earns a place here, and importing it then costs one detail
 * fetch. The alternative is importing TMDB's million titles in advance
 * against the chance that one is wanted, which is a worse trade in every
 * direction: storage, sync, and a catalogue whose search results are mostly
 * things nobody has heard of.
 *
 * The work itself is in lib/catalogue-pick, because the import *route* is a
 * server component and cannot call anything that revalidates during a
 * render. What this adds is the cache invalidation, which only a real
 * action is allowed to do.
 */
export async function adoptTitle(ref: string): Promise<FilmPick | null> {
  const result = await adopt(ref);
  if (!result) return null;

  if (result.created) revalidatePath("/films");
  return result.film;
}
