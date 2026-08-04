-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Living Map (Phase 0)
-- Verified visits · personal buildings · area-heat scaffolding
-- Run AFTER 001_initial_schema.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── SPOTS: add a spatial column (scalable geo) ────────────────────────────────
-- Generated from existing lng/lat so it stays in sync automatically.
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS spots_location_gix ON spots USING GIST (location);


-- ── VISITS ────────────────────────────────────────────────────────────────────
-- One row per check-in. `verified` = GPS within radius + fresh timestamp,
-- decided server-side. Building tier is derived from the count of verified rows.
CREATE TABLE IF NOT EXISTS visits (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id    UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  lat        DECIMAL(9,6),
  lng        DECIMAL(9,6),
  location   geography(Point, 4326)
             GENERATED ALWAYS AS (
               CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
               END
             ) STORED,
  geohash7   TEXT
             GENERATED ALWAYS AS (
               CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
                    THEN ST_GeoHash(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 7)
               END
             ) STORED,
  photo_url  TEXT        DEFAULT '',
  verified   BOOLEAN     DEFAULT FALSE,
  distance_m DECIMAL(8,1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS visits_user_spot_idx ON visits (user_id, spot_id);
CREATE INDEX IF NOT EXISTS visits_user_verified_idx ON visits (user_id, verified);
CREATE INDEX IF NOT EXISTS visits_geohash_idx ON visits (geohash7) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS visits_created_idx ON visits (created_at);
CREATE INDEX IF NOT EXISTS visits_location_gix ON visits USING GIST (location);


-- ── POINTS LEDGER (loyalty scaffolding) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS points_ledger (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT DEFAULT '',
  visit_id   UUID REFERENCES visits(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_user_idx ON points_ledger (user_id);


-- ── AREA HEAT (tower engine — populated by scheduled job in Phase 3) ───────────
-- Kept as a summary table so tower reads never scan raw visits.
CREATE TABLE IF NOT EXISTS area_heat (
  geohash7     TEXT PRIMARY KEY,
  heat_score   DECIMAL(10,3) DEFAULT 0,
  tier         SMALLINT       DEFAULT 0,   -- 0 none · 1 small · 2 tall · 3 blazing
  top_spot_ids UUID[]         DEFAULT '{}',
  updated_at   TIMESTAMPTZ    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS area_heat_tier_idx ON area_heat (tier) WHERE tier > 0;


-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_heat     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_own"        ON visits        FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "points_own_read"   ON points_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "area_heat_public"  ON area_heat     FOR SELECT USING (TRUE);
-- (backend uses the service-role key and bypasses RLS for writes)


-- ── RPC: spots within map bounds (viewport-bounded, index-backed) ─────────────
-- Frontend/map fetches only what's visible, using the GiST index. Scales.
CREATE OR REPLACE FUNCTION spots_in_bounds(
  min_lng DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_rows INTEGER DEFAULT 300
)
RETURNS SETOF spots
LANGUAGE sql STABLE AS $$
  SELECT *
  FROM spots
  WHERE verified = TRUE
    AND location IS NOT NULL
    AND location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  LIMIT max_rows;
$$;
