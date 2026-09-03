-- 2026-09-03 — email confirmation and recommendation feedback
--
-- Why this file exists at all: `prisma db push` cannot reach Turso. The
-- Prisma CLI's schema engine speaks native database protocols and has no
-- driver-adapter hook in its config, so a `libsql://` URL comes back as
-- "P1013: the scheme is not recognized". The runtime is fine — lib/db.ts
-- connects through @prisma/adapter-libsql — but the CLI is not, and the
-- gap has to be crossed by hand.
--
-- Generated, not written:
--
--   npx prisma migrate diff --from-schema <previous> --to-schema \
--     prisma/schema.prisma --script
--
-- Apply to production before deploying the code that needs it:
--
--   turso db shell <database> < prisma/migrations-turso/2026-09-03-verification-and-feedback.sql
--
-- Then, if the database already has members and mail is configured:
--
--   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run accounts:grandfather
--
-- Safe to run once. Re-running fails on the CREATE TABLE, which is the
-- correct outcome rather than a silent second attempt.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" DATETIME;

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'verify',
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilmFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilmFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilmFeedback_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "FilmFeedback_filmId_idx" ON "FilmFeedback"("filmId");

-- CreateIndex
CREATE UNIQUE INDEX "FilmFeedback_userId_filmId_key" ON "FilmFeedback"("userId", "filmId");

