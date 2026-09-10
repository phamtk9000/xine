import "dotenv/config";
import { db } from "@/lib/db";

// Read directly rather than importing lib/mail, which is marked server-only
// and throws the moment a script touches it.
const mailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/**
 * Why can this person not sign in?
 *
 *   npm run accounts:check -- someone@example.com
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run accounts:check -- …
 *
 * Sign-in fails for four reasons and the page deliberately cannot tell you
 * which: saying "no account with that email" to a stranger turns the form
 * into a list of who is a member here. That is right for the form and
 * useless for whoever has to fix it, so the answer lives here instead, where
 * it takes database credentials to ask the question.
 *
 * Never prints or accepts a password. If the account exists, is confirmed,
 * and the person still cannot get in, the password is wrong and the fix is a
 * reset — not somebody reading a hash out of a terminal.
 */

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run accounts:check -- someone@example.com");
    process.exit(1);
  }

  const where = process.env.TURSO_DATABASE_URL ? "production" : "local dev.db";
  console.log(`Looking in ${where}.`);
  console.log(
    mailConfigured()
      ? "Mail is configured, so unconfirmed accounts are refused at sign-in."
      : "Mail is NOT configured, so the confirmation check is skipped entirely.",
  );

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      emailVerified: true,
      createdAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    console.log(`\nNo account for ${email} in ${where}.`);
    const total = await db.user.count();
    console.log(`This database holds ${total} account${total === 1 ? "" : "s"}.`);
    return;
  }

  console.log(`\nAccount found: @${user.username}, created ${user.createdAt.toISOString()}`);
  console.log(`  password on file: ${user.passwordHash ? "yes" : "NO — cannot sign in"}`);
  console.log(
    user.emailVerified
      ? `  confirmed: ${user.emailVerified.toISOString()}`
      : "  confirmed: NO",
  );

  if (!user.emailVerified && mailConfigured()) {
    console.log(
      "\nThis is the blocker. The account predates email confirmation, or the letter\n" +
        "was never opened, and mail is now configured — so sign-in refuses it.\n" +
        "Fix: npm run accounts:grandfather (marks every existing account confirmed).",
    );
  } else if (user.passwordHash) {
    console.log("\nNothing here would block sign-in. The password is the remaining suspect.");
  }
}

main();
