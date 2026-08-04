-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Verified Reviews (Phase 1)
-- Ties reviews to a verified visit and speeds up the feed / per-spot queries.
-- Run AFTER 002_living_map.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS reviews_spot_recent_idx ON reviews (spot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_recent_idx      ON reviews (created_at DESC);
