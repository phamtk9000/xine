import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 keeps connection details out of the schema. The CLI (db push,
// studio, seed) reads them here; the runtime client gets them through the
// driver adapter in lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
