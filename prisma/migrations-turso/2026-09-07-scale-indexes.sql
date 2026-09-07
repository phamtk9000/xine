-- 2026-09-07 — indexes for a seventy-thousand-film catalogue
--
-- Pure indexes: no data changes, safe to apply while the site is serving.
--   turso org switch vercel-icfg-vviq8my2eb6ejyyuhasvmif9
--   turso db shell database-blue-car < prisma/migrations-turso/2026-09-07-scale-indexes.sql

-- CreateIndex
CREATE INDEX "Film_tmdbVotes_idx" ON "Film"("tmdbVotes");

-- CreateIndex
CREATE INDEX "Film_kind_tmdbVotes_idx" ON "Film"("kind", "tmdbVotes");

-- CreateIndex
CREATE INDEX "Film_criticScore_idx" ON "Film"("criticScore");

-- CreateIndex
CREATE INDEX "Film_releasedAt_idx" ON "Film"("releasedAt");

