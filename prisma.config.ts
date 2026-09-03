import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps connection details out of the schema. The CLI (db push,
 * studio, seed) reads them here; the runtime client gets them through the
 * driver adapter in lib/db.ts.
 *
 * Resolved from the environment by hand rather than with prisma's `env()`
 * helper, which throws when the variable is absent — and it is absent on a
 * build server. `.env` is gitignored, so nothing sets DATABASE_URL there,
 * and `prisma generate` in postinstall was killing the whole deployment
 * over a value it does not use: generate reads the schema and writes a
 * client, it never opens a connection.
 *
 * The order matters. TURSO_DATABASE_URL first, so a CLI command run against
 * production (`prisma studio`, a one-off `db push`) talks to the same
 * database the app does. Then DATABASE_URL for local work. The file at the
 * end is a shape, not a destination — it exists so `generate` has something
 * to parse, and any command that genuinely needs a database will fail
 * loudly against it rather than quietly against the wrong one.
 */
const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
