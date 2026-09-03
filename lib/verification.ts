import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendMail, siteUrl } from "@/lib/mail";

/**
 * Proving that whoever typed an address can also read it.
 *
 * The step is small and the reasons are not. An unverified address is a
 * typo waiting to lock somebody out of their own account, a way to sign up
 * as someone else and have their name on a public profile, and — once there
 * is any mail at all — a way to point this site's outbound at a stranger.
 * One click on a link in an inbox settles all three.
 *
 * The token is a 32-byte random string, and only its SHA-256 is stored, on
 * the same reasoning as the password column: a leaked copy of this table
 * should not be a set of working keys. There is no pepper and no HMAC
 * because there is nothing to protect against a guess — 256 bits of entropy
 * is not a thing anybody brute-forces, and unlike a password it has no
 * low-entropy sibling to be looked up in a rainbow table.
 *
 * Rows survive being used. "That link has already been used" and "that link
 * never existed" are different sentences, and a reader who clicks twice
 * deserves the first one.
 */

const TTL_MS = 1000 * 60 * 60 * 24; // A day is long enough to find the mail.
/** How long before a member may ask for another. */
const RESEND_MS = 1000 * 60;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type IssueResult = {
  delivered: boolean;
  /** Only ever returned in development — see the note in `issueVerification`. */
  url?: string;
  error?: string;
};

/**
 * Mint a verification link and mail it.
 *
 * In development the URL comes back to the caller so the sign-up flow can
 * put it on screen; there is no mail provider on a laptop and copying it out
 * of the terminal every time is the kind of friction that gets a feature
 * quietly disabled. It is never returned in production, where the whole
 * point is that only the inbox has it.
 */
export async function issueVerification(
  userId: string,
  email: string,
  displayName: string,
): Promise<IssueResult> {
  const recent = await db.emailToken.findFirst({
    where: {
      userId,
      purpose: "verify",
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_MS) },
    },
    select: { id: true },
  });
  if (recent) {
    return { delivered: false, error: "A link is already on its way — give it a minute" };
  }

  const token = randomBytes(32).toString("base64url");

  await db.emailToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      purpose: "verify",
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const url = `${siteUrl()}/verify?token=${token}`;

  const result = await sendMail({
    to: email,
    subject: "Confirm your email for xine",
    text: [
      `${displayName},`,
      "",
      "Confirm this address and your xine account is ready:",
      url,
      "",
      "The link works once and expires in 24 hours.",
      "If you did not create an account, ignore this — nothing happens until the link is used.",
      "",
      "xine",
    ].join("\n"),
  });

  return {
    delivered: result.delivered,
    error: result.error,
    url: process.env.NODE_ENV === "production" ? undefined : url,
  };
}

export type ConsumeResult =
  | { ok: true; username: string }
  | { ok: false; reason: "unknown" | "used" | "expired" };

/** Spend a link. Idempotent in the sense that a second click says so. */
export async function consumeVerification(
  token: string,
): Promise<ConsumeResult> {
  const row = await db.emailToken.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      purpose: true,
      user: { select: { id: true, username: true, emailVerified: true } },
    },
  });

  if (!row || row.purpose !== "verify") return { ok: false, reason: "unknown" };
  // Already verified counts as used, however the row got there.
  if (row.usedAt || row.user.emailVerified) {
    return { ok: false, reason: "used" };
  }
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  await db.$transaction([
    db.emailToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: row.user.id },
      data: { emailVerified: new Date() },
    }),
    // Any other verification link for this account is now moot.
    db.emailToken.updateMany({
      where: { userId: row.user.id, purpose: "verify", usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, username: row.user.username };
}
