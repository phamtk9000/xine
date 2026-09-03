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
import { mailConfigured } from "@/lib/mail";
import { issueVerification } from "@/lib/verification";

export type AuthState = {
  error?: string;
  /** Sign-up went through and a confirmation link was mailed. */
  sent?: {
    delivered: boolean;
    /** Development only, so a laptop with no mail provider still works. */
    devUrl?: string;
    note?: string;
  };
  /** Sign-in refused because the address has never been confirmed. */
  unverified?: boolean;
  /** A resend was attempted. Always phrased so it reveals nothing. */
  resent?: boolean;
} | null;

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

  // No session yet. An account exists the moment the form is submitted, but
  // it does not become *theirs* until somebody proves they can read the
  // address — otherwise a typo locks a real person out of a username, and
  // anybody can put a stranger's address on a public profile.
  const issued = await issueVerification(user.id, email, displayName);

  return {
    sent: {
      delivered: issued.delivered,
      devUrl: issued.url,
      note: issued.delivered ? undefined : issued.error,
    },
  };
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

  // Only enforced where the letter can actually be sent. A deployment with
  // no mail provider that still demanded a confirmed address would lock out
  // every member over a missing environment variable, and there would be
  // nothing they could do about it from their side. The link is minted and
  // logged either way, so nothing is lost by letting them in meanwhile.
  if (!user.emailVerified && mailConfigured()) {
    return {
      error:
        "Confirm your email first — the link is in the inbox for this address.",
      unverified: true,
    };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")) ?? `/community/${user.username}`);
}

/**
 * Send another confirmation link.
 *
 * The answer is the same sentence whether or not the address has an account,
 * because a resend form that says "no account here" is an account-enumeration
 * oracle — somebody can feed it a list of addresses and learn which of them
 * are members of this site. The rate limit lives with the token in
 * lib/verification.
 */
export async function resendVerification(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Which address?" };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, displayName: true, emailVerified: true },
  });

  let devUrl: string | undefined;
  if (user && !user.emailVerified) {
    const issued = await issueVerification(user.id, email, user.displayName);
    devUrl = issued.url;
  }

  return { resent: true, sent: { delivered: true, devUrl } };
}

export async function signOut() {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}
