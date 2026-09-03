-- 2026-09-03b — recommendation sessions, events, profiles and taste vectors
--
-- Apply BEFORE the deploy that needs it:
--   turso org switch <the vercel-managed org>
--   turso db shell <database> < prisma/migrations-turso/2026-09-03b-recommendation-engine.sql
--
-- Generated with:
--   npx prisma migrate diff --from-schema <previous> --to-schema \
--     prisma/schema.prisma --script
--
-- See prisma/migrations-turso/2026-09-03-verification-and-feedback.sql for
-- why these files exist at all: the Prisma CLI cannot speak libsql, so a
-- schema change reaches Turso as SQL or not at all.

-- AlterTable
ALTER TABLE "FilmFeedback" ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "RecSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "answers" TEXT NOT NULL DEFAULT '{}',
    "query" TEXT,
    "intent" TEXT NOT NULL DEFAULT '{}',
    "drift" TEXT NOT NULL DEFAULT '{}',
    "confidence" REAL NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "promptVersion" TEXT,
    CONSTRAINT "RecSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "filmId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER,
    "score" REAL,
    "reason" TEXT,
    "payload" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    CONSTRAINT "RecEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecEvent_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilmProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filmId" TEXT NOT NULL,
    "dims" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'derived',
    "confidence" REAL NOT NULL DEFAULT 0.4,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilmProfile_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TasteVector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dims" TEXT NOT NULL DEFAULT '{}',
    "affinities" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TasteVector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecSession_userId_createdAt_idx" ON "RecSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecEvent_sessionId_createdAt_idx" ON "RecEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RecEvent_userId_type_idx" ON "RecEvent"("userId", "type");

-- CreateIndex
CREATE INDEX "RecEvent_filmId_type_idx" ON "RecEvent"("filmId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FilmProfile_filmId_key" ON "FilmProfile"("filmId");

-- CreateIndex
CREATE INDEX "FilmProfile_source_idx" ON "FilmProfile"("source");

-- CreateIndex
CREATE UNIQUE INDEX "TasteVector_userId_key" ON "TasteVector"("userId");

