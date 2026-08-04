-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Restaurant ownership (Phase 4b)
-- A per-spot claim code lets a venue prove ownership: you generate the code and
-- hand it over; the manager enters it to claim the spot.
-- Run AFTER 007_rewards.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS claim_code TEXT UNIQUE;
