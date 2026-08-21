"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/session";

export type AuthState = { error?: string } | null;

const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you").max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Usernames are at least 3 characters")
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Letters, numbers and underscores only"),
  email: z.email("That email doesn't look right").toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters"),
});

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { displayName, username, email, password } = parsed.data;

  const clash = await db.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true },
  });
  if (clash) {
    return {
      error:
        clash.username === username
          ? "That username is taken"
          : "There is already an account with that email",
    };
  }

  const user = await db.user.create({
    data: {
      displayName,
      username,
      email,
      passwordHash: await hashPassword(password),
    },
  });

  await createSession(user.id);
  redirect(safeNext(formData.get("next")) ?? `/community/${user.username}`);
}

/**
 * Where to land after signing in.
 *
 * Only a path on this site is ever accepted. A bare `next` taken on trust is
 * an open redirect — `?next=https://evil.example` would send someone who just
 * typed their password straight off the site, with xine's sign-in page as the
 * thing that vouched for it. Protocol-relative `//host` is the same attack
 * without the scheme, so it is rejected too.
 */
function safeNext(value: FormDataEntryValue | null): string | null {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password, please" };

  const user = await db.user.findUnique({ where: { email } });
  // Same message either way — telling a stranger which half was wrong tells
  // them which emails have accounts.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "That email and password don't match" };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")) ?? `/community/${user.username}`);
}

export async function signOut() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}
