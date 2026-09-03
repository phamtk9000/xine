"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { rebuildTaste } from "@/lib/rec/taste";

/**
 * The fast path into a taste profile, for somebody with none.
 *
 * Everything else that builds a profile — a rating, a kept suggestion, a
 * refused one — is a byproduct of using the site. This is the one place that
 * asks for taste directly, and it asks for the cheapest version of it: five
 * films loved, three not connected with. That is not a substitute for real
 * ratings — both are written as ordinary Rating rows, at 8.7 and 3.2, so
 * every part of the site that reads ratings treats them exactly as such —
 * it is a shortcut to having enough of them for the recommender to start
 * from something other than the editorial average.
 */
export async function submitOnboarding(
  loved: string[],
  disliked: string[],
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const ids = [...new Set([...loved, ...disliked])];
  const known = await db.film.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const valid = new Set(known.map((film) => film.id));

  const rows = [
    ...loved.filter((id) => valid.has(id)).map((filmId) => ({ filmId, overall: 8.7 })),
    ...disliked.filter((id) => valid.has(id)).map((filmId) => ({ filmId, overall: 3.2 })),
  ];

  if (rows.length === 0) return { ok: false };

  await db.$transaction(
    rows.map((row) =>
      db.rating.upsert({
        where: { userId_filmId: { userId: user.id, filmId: row.filmId } },
        create: { userId: user.id, filmId: row.filmId, overall: row.overall },
        // Never overwrite a rating that already exists — onboarding is a
        // floor under a profile, not a way to quietly revise one.
        update: {},
      }),
    ),
  );

  await rebuildTaste(user.id);

  revalidatePath("/watch");
  revalidatePath("/for-you");
  revalidatePath("/watch/taste");
  return { ok: true };
}
