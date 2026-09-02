"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type ProfileState = { error?: string; ok?: boolean } | null;

/**
 * How big an avatar is allowed to be, after the browser has resized it.
 *
 * A 256px WebP of a photograph lands around 10–15KB; this leaves room for an
 * awkward one and refuses anything that suggests the client-side resize was
 * skipped or bypassed. The cap matters because this column is read on every
 * page that lists members — an unbounded blob here would be paid for on
 * every one of them.
 */
const MAX_AVATAR_BYTES = 96 * 1024;

/** Only formats a browser canvas can actually produce. */
const AVATAR_PREFIX = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "A display name needs at least two characters")
    .max(60, "That display name is too long"),
  bio: z.string().trim().max(400, "Keep the bio under 400 characters"),
  location: z.string().trim().max(80, "That location is too long"),
});

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to edit your profile" };

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Three states, and they are not the same: a field that was left alone
  // (absent), a picture being cleared (the literal "remove"), and a new one.
  const submitted = formData.get("avatar");
  let avatar: string | null | undefined;

  if (submitted === "remove") {
    avatar = null;
  } else if (typeof submitted === "string" && submitted.length > 0) {
    if (!AVATAR_PREFIX.test(submitted)) {
      return { error: "That image could not be read" };
    }
    // Base64 carries 3 bytes in every 4 characters.
    const bytes = Math.floor((submitted.length * 3) / 4);
    if (bytes > MAX_AVATAR_BYTES) {
      return { error: "That image is too large — try a smaller one" };
    }
    avatar = submitted;
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      displayName: parsed.data.displayName,
      bio: parsed.data.bio || null,
      location: parsed.data.location || null,
      ...(avatar === undefined ? {} : { avatar }),
    },
  });

  revalidatePath(`/community/${user.username}`);
  revalidatePath("/community");
  revalidatePath("/settings");
  return { ok: true };
}
