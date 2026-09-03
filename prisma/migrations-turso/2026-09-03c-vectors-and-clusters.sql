-- 2026-09-03c — embeddings, editorial clusters and precomputed neighbours
--
-- Apply BEFORE the deploy that needs it:
--   turso org switch <the vercel-managed org>
--   turso db shell <database> < prisma/migrations-turso/2026-09-03c-vectors-and-clusters.sql
--
-- These three tables are populated by scripts rather than by the app, so
-- after the migration the production catalogue has the tables and no rows —
-- which degrades honestly: neighbours fall back to genre and crew, and
-- clusters contribute nothing until `npm run films:cluster` has run against
-- production.

-- CreateTable
CREATE TABLE "FilmEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filmId" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'hash-tfidf-v1',
    "dims" INTEGER NOT NULL DEFAULT 256,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilmEmbedding_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilmCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filmId" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    CONSTRAINT "FilmCluster_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilmNeighbour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filmId" TEXT NOT NULL,
    "neighbourId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "parts" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "FilmNeighbour_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilmNeighbour_neighbourId_fkey" FOREIGN KEY ("neighbourId") REFERENCES "Film" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FilmEmbedding_filmId_key" ON "FilmEmbedding"("filmId");

-- CreateIndex
CREATE INDEX "FilmEmbedding_model_idx" ON "FilmEmbedding"("model");

-- CreateIndex
CREATE INDEX "FilmCluster_cluster_weight_idx" ON "FilmCluster"("cluster", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "FilmCluster_filmId_cluster_key" ON "FilmCluster"("filmId", "cluster");

-- CreateIndex
CREATE INDEX "FilmNeighbour_filmId_score_idx" ON "FilmNeighbour"("filmId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "FilmNeighbour_filmId_neighbourId_key" ON "FilmNeighbour"("filmId", "neighbourId");

