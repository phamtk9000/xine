import "dotenv/config";
import { db } from "@/lib/db";

/**
 * Mark every existing account as confirmed.
 *
 * Run once, on the deployment where email confirmation is switched on — that
 * is, the first time RESEND_API_KEY is set on a database that already has
 * members. Accounts made before the feature existed have no confirmation on
 * file and nobody ever asked them for one, so without this they would all be
 * refused at sign-in for failing a step that did not exist when they signed
 * up.
 *
 * Idempotent: it only touches rows that are still null, so running it twice
 * changes nothing the second time.
 *
 *   npm run accounts:grandfather
 */

async function main() {
  const pending = await db.user.count({ where: { emailVerified: null } });
  if (pending === 0) {
    console.log("Nothing to do — every account already has a confirmation.");
    return;
  }

  const { count } = await db.user.updateMany({
    where: { emailVerified: null },
    data: { emailVerified: new Date() },
  });

  console.log(`Marked ${count} existing account${count === 1 ? "" : "s"} as confirmed.`);
  console.log("New sign-ups from here on have to confirm their address.");
}

main();
