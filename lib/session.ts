import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const COOKIE = "xine_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set — see .env");
  return new TextEncoder().encode(value);
}

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar: string | null;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * A short fingerprint of the password hash, carried in every session token.
 *
 * Sessions are signed tokens with no table behind them, which is cheap and
 * has one serious gap: nothing can revoke one. Change your password because
 * it leaked, and whoever signed in with the old one stays signed in for up to
 * thirty days. So each token records which password it was issued under, and
 * `getCurrentUser` refuses any token whose fingerprint no longer matches.
 * Changing the password changes the hash — bcrypt salts every hash, so even
 * re-using the same password produces a new one — and every other session
 * dies at once.
 *
 * A digest of the hash rather than the hash itself: a cookie is not the place
 * for anything an attacker could run a dictionary against.
 */
function stamp(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function createSession(userId: string) {
  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!owner) throw new Error("No such user");

  const token = await new SignJWT({ sub: userId, pw: stamp(owner.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (!id) return null;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatar: true,
        passwordHash: true,
      },
    });
    if (!user) return null;

    // Issued under a password that has since changed — or before tokens
    // carried a fingerprint at all, which signs everybody out once when this
    // ships. That is deliberate: the reason to add revocation was a password
    // that had leaked, and a grace period for old tokens is exactly the gap
    // an attacker holding one would use.
    if (payload.pw !== stamp(user.passwordHash)) return null;

    const { passwordHash: _, ...session } = user;
    return session;
  } catch {
    // Expired or tampered-with token. Treat as signed out rather than throwing;
    // the cookie gets replaced on the next sign-in.
    return null;
  }
}

/** For pages that make no sense signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
