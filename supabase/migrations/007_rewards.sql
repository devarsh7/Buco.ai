-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Rewards & redemption (Phase 4a)
-- Restaurant-funded rewards, spent with points, redeemed in-store via a
-- one-time Buco code (no POS integration — staff apply a manual comp).
-- Run AFTER 006_heat.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rewards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spot_id     UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  cost_points INTEGER NOT NULL CHECK (cost_points > 0),
  stock       INTEGER,                       -- NULL = unlimited
  terms       TEXT DEFAULT '',
  active      BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rewards_spot_idx ON rewards (spot_id) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS redemptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id    UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  spot_id      UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'issued'
               CHECK (status IN ('issued','redeemed','expired')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  redeemed_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS redemptions_user_idx ON redemptions (user_id, status);
CREATE INDEX IF NOT EXISTS redemptions_code_idx ON redemptions (code);

-- Who manages a venue (used by the restaurant dashboard in Phase 4b).
CREATE TABLE IF NOT EXISTS spot_managers (
  spot_id    UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT DEFAULT 'manager',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (spot_id, user_id)
);

ALTER TABLE rewards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rewards_public_read"   ON rewards       FOR SELECT USING (active = TRUE);
CREATE POLICY "redemptions_own"       ON redemptions   FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "spot_managers_self"    ON spot_managers FOR SELECT USING (auth.uid() = user_id);
-- (backend uses the service-role key and bypasses RLS for writes)
