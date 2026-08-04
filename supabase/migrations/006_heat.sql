-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Area Heat centroids (Phase 3)
-- Adds a representative point + visitor count to the tower summary table so
-- towers can be rendered without scanning raw visits.
-- Run AFTER 005_lists.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE area_heat
  ADD COLUMN IF NOT EXISTS lat           DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS lng           DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS visitor_count INTEGER DEFAULT 0;
