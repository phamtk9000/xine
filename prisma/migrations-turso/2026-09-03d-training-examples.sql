-- 2026-09-03d — the labelled training set
--
-- One table, written by `npm run rec:training` from the event log. Nothing
-- the application reads, so it can be applied at any time.
--
--   turso org switch <the vercel-managed org>
--   turso db shell <database> < prisma/migrations-turso/2026-09-03d-training-examples.sql

-- CreateTable
CREATE TABLE "RecTrainingExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "features" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" REAL NOT NULL,
    "label" REAL NOT NULL,
    "outcome" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "RecTrainingExample_label_idx" ON "RecTrainingExample"("label");

-- CreateIndex
CREATE UNIQUE INDEX "RecTrainingExample_sessionId_filmId_key" ON "RecTrainingExample"("sessionId", "filmId");

