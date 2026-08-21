"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { ActionResult } from "@/app/actions/films";

const UNAUTHENTICATED: ActionResult = {
  ok: false,
  message: "Sign in to do that",
};

/**
 * The quick actions: watched, liked.
 *
 * Both write into the same FilmLog row, so one film is one row per person
 * however many marks it carries, and toggling one never disturbs the other's
 * timestamp.
 *
 * Two rules are enforced here rather than left to the interface, because
 * they are facts about the data and not about the buttons:
 *
 *   - Liking implies watching. You cannot like a film you have not seen, so
 *     a like on an unwatched film sets `watchedAt` too. Without this the
 *     monthly digest would have to reconcile a liked film that never
 *     appeared in the month's viewing.
 *   - Un-watching clears the like, for the same reason in reverse.
 *
 * A film being marked watched also leaves the watchlist. The watchlist is
 * intent; keeping something there after you have seen it turns it into a
 * list of things you have already done.
 */

async function upsertLog(
  userId: string,
  filmId: string,
  patch: { watchedAt?: Date | null; likedAt?: Date | null },
) {
  return db.filmLog.upsert({
    where: { userId_filmId: { userId, filmId } },
    create: { userId, filmId, ...patch },
    update: patch,
  });
}

function refresh(slug: string, username: string) {
  revalidatePath(`/films/${slug}`);
  revalidatePath(`/community/${username}`);
  revalidatePath("/taste");
}

export async function toggleWatched(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!filmId) return { ok: false, message: "Missing film" };

  const existing = await db.filmLog.findUnique({
    where: { userId_filmId: { userId: user.id, filmId } },
  });
  const nowWatched = !existing?.watchedAt;

  await upsertLog(user.id, filmId, {
    watchedAt: nowWatched ? new Date() : null,
    // Un-watching drops the like with it — see the note above.
    ...(nowWatched ? {} : { likedAt: null }),
  });

  if (nowWatched) {
    // Seen it, so it is no longer something to get to.
    await db.watchlistItem.deleteMany({
      where: { userId: user.id, filmId },
    });
    await db.activity.create({
      data: { userId: user.id, filmId, type: "watched" },
    });
  }

  refresh(slug, user.username);
  return { ok: true };
}

export async function toggleLiked(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!filmId) return { ok: false, message: "Missing film" };

  const existing = await db.filmLog.findUnique({
    where: { userId_filmId: { userId: user.id, filmId } },
  });
  const nowLiked = !existing?.likedAt;

  await upsertLog(user.id, filmId, {
    likedAt: nowLiked ? new Date() : null,
    // A like is also a claim to have seen it.
    ...(nowLiked && !existing?.watchedAt ? { watchedAt: new Date() } : {}),
  });

  if (nowLiked) {
    await db.watchlistItem.deleteMany({ where: { userId: user.id, filmId } });
    await db.activity.create({
      data: { userId: user.id, filmId, type: "liked" },
    });
  }

  refresh(slug, user.username);
  return { ok: true };
}
