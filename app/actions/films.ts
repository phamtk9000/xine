"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { clampScore, deriveOverall, type AxisScores } from "@/lib/scores";

export type ActionResult = { ok: boolean; message?: string };

const UNAUTHENTICATED: ActionResult = {
  ok: false,
  message: "Sign in to do that",
};

function optionalScore(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : clampScore(parsed);
}

export async function rateFilm(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!filmId) return { ok: false, message: "Missing film" };

  const axes: AxisScores = {
    story: optionalScore(formData.get("story")),
    direction: optionalScore(formData.get("direction")),
    visual: optionalScore(formData.get("visual")),
    performance: optionalScore(formData.get("performance")),
    sound: optionalScore(formData.get("sound")),
  };

  // An explicit overall wins; otherwise it falls out of whichever axes were
  // filled in. One of the two always exists because the form requires it.
  const submitted = optionalScore(formData.get("overall"));
  const overall = submitted ?? deriveOverall(axes);
  if (overall === null) return { ok: false, message: "Give it a score first" };

  await db.rating.upsert({
    where: { userId_filmId: { userId: user.id, filmId } },
    create: { userId: user.id, filmId, overall, ...axes },
    update: { overall, ...axes },
  });

  await db.activity.create({
    data: {
      userId: user.id,
      filmId,
      type: "rated",
      payload: JSON.stringify({ overall }),
    },
  });

  revalidatePath(`/films/${slug}`);
  revalidatePath(`/community/${user.username}`);
  revalidatePath("/community");
  return { ok: true };
}

export async function toggleWatchlist(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!filmId) return { ok: false, message: "Missing film" };

  const existing = await db.watchlistItem.findUnique({
    where: { userId_filmId: { userId: user.id, filmId } },
  });

  if (existing) {
    await db.watchlistItem.delete({ where: { id: existing.id } });
  } else {
    await db.watchlistItem.create({ data: { userId: user.id, filmId } });
    await db.activity.create({
      data: { userId: user.id, filmId, type: "watchlisted" },
    });
  }

  revalidatePath(`/films/${slug}`);
  revalidatePath(`/community/${user.username}`);
  return { ok: true };
}

export async function postReview(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const spoilers = formData.get("spoilers") === "on";

  if (body.length < 20) {
    return { ok: false, message: "A review needs a bit more than that" };
  }

  await db.review.upsert({
    where: { userId_filmId: { userId: user.id, filmId } },
    create: { userId: user.id, filmId, body, spoilers },
    update: { body, spoilers },
  });

  await db.activity.create({
    data: { userId: user.id, filmId, type: "reviewed" },
  });

  revalidatePath(`/films/${slug}`);
  revalidatePath("/reviews");
  revalidatePath("/community");
  return { ok: true };
}

export async function addToList(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHENTICATED;

  const filmId = String(formData.get("filmId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!filmId || !listId) return { ok: false, message: "Pick a list" };

  const list = await db.filmList.findUnique({
    where: { id: listId },
    include: { _count: { select: { entries: true } } },
  });
  if (!list || list.ownerId !== user.id) {
    return { ok: false, message: "That isn't your list" };
  }

  const existing = await db.listEntry.findUnique({
    where: { listId_filmId: { listId, filmId } },
  });
  if (existing) return { ok: true, message: "Already in that list" };

  await db.listEntry.create({
    data: { listId, filmId, position: list._count.entries },
  });

  revalidatePath(`/films/${slug}`);
  revalidatePath(`/lists/${list.slug}`);
  return { ok: true, message: `Added to ${list.title}` };
}
