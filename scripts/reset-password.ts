import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { db } from "@/lib/db";

/**
 * Set a member's password from the terminal, for when they cannot sign in.
 *
 *   npm run accounts:reset-password -- someone@example.com
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run accounts:reset-password -- …
 *
 * The site has no "forgot password" link, and could not honour one if it
 * did: a reset link has to arrive by email, and no mail provider is
 * configured. Until one is, this is the way back in — run by whoever holds
 * the database credentials, which is the same bar a reset email would clear.
 *
 * The new password is typed at a hidden prompt, twice, and never accepted as
 * an argument. An argument lands in shell history, in `ps` output for every
 * user on the machine, and in any log that captures the command line; a
 * hidden prompt lands nowhere.
 *
 * Every existing session for the account ends when this runs, because
 * session tokens carry a fingerprint of the password hash (lib/session.ts).
 */

const COST = 10; // Matches hashPassword in lib/session.ts, which a script cannot import.

function ask(question: string, hidden: boolean): Promise<string> {
  process.stdout.write(question);
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const line = createInterface({
    input: process.stdin,
    output: hidden ? silent : process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    line.question("", (answer) => {
      line.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run accounts:reset-password -- someone@example.com");
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    console.error("Run this in a terminal. The password is typed at a hidden prompt, never piped or passed in.");
    process.exit(1);
  }

  const where = process.env.TURSO_DATABASE_URL ? "production" : "local dev.db";
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error(`No account for ${email} in ${where}.`);
    process.exit(1);
  }

  console.log(`Setting a new password for @${user.username} in ${where}.`);
  const first = await ask("New password (hidden): ", true);
  if (first.length < 8) {
    console.error("Use at least 8 characters. Nothing was changed.");
    process.exit(1);
  }
  const second = await ask("Same again: ", true);
  if (first !== second) {
    console.error("Those don't match. Nothing was changed.");
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(first, COST) },
  });

  console.log(`Done. @${user.username} can sign in with the new password; every other session has ended.`);
}

main();
