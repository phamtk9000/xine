"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type FollowResult = { ok: boolean; following?: boolean; message?: string };

/**
 * Follow or unfollow a member.
 *
 * One action rather than two, because the button is a toggle and the client
 * already knows which state it is in — splitting it would mean the caller
 * choosing an endpoint from state it holds optimistically, which is exactly
 * how a double-click ends up unfollowing somebody it just followed.
 *
 * The write is idempotent in both directions: following twice is a no-op
 * through the unique pair, and unfollowing somebody you do not follow
 * deletes nothing and reports success.
 */
export async function toggleFollow(formData: FormData): Promise<FollowResult> {
  const viewer = await getCurrentUser();
  if (!viewer) return { ok: false, message: "Sign in to follow people" };

  const username = String(formData.get("username") ?? "");
  if (!username) return { ok: false, message: "Missing member" };

  const target = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) return { ok: false, message: "No such member" };
  if (target.id === viewer.id) {
    return { ok: false, message: "You cannot follow yourself" };
  }

  const pair = { followerId: viewer.id, followingId: target.id };
  const existing = await db.follow.findUnique({
    where: { followerId_followingId: pair },
    select: { id: true },
  });

  if (existing) {
    await db.follow.delete({ where: { id: existing.id } });
  } else {
    await db.follow.create({ data: pair });
  }

  revalidatePath(`/community/${username}`);
  revalidatePath("/community");
  return { ok: true, following: !existing };
}
