-- 2026-09-06 — trailer keys on Film
--
-- Apply BEFORE pushing films, or the film sync fails on the first batch:
--   turso org switch <the vercel-managed org>
--   turso db shell <database> < prisma/migrations-turso/2026-09-06-trailer-keys.sql

-- AlterTable
ALTER TABLE "Film" ADD COLUMN "trailerKey" TEXT;

