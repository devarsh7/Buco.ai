-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Restaurant profile (Phase 4c)
-- Lets a venue manager enrich their spot: menu photos, deal photos, a deal
-- comment, and a happy-hour note (shown to customers).
-- Run AFTER 009_user_provisioning.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS menu_photos     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deal_photos     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deal_comment    TEXT   DEFAULT '',
  ADD COLUMN IF NOT EXISTS happy_hour_note TEXT   DEFAULT '';
