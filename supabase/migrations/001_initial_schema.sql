-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Initial Database Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;


-- ── SPOTS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('restaurant','cafe','salon','spa','bar','other')),
  cuisine_tags  TEXT[]        DEFAULT '{}',
  address       TEXT          NOT NULL,
  city          TEXT          NOT NULL,
  lat           DECIMAL(9,6),
  lng           DECIMAL(9,6),
  price_min     DECIMAL(6,2),
  price_max     DECIMAL(6,2),
  phone         TEXT          DEFAULT '',
  website       TEXT          DEFAULT '',
  hours         JSONB         DEFAULT '{}',
  happy_hour    JSONB         DEFAULT '{}',
  photos        TEXT[]        DEFAULT '{}',
  menu_url      TEXT          DEFAULT '',
  yelp_id       TEXT,
  buco_pick     BOOLEAN       DEFAULT FALSE,
  buco_score    DECIMAL(3,1),
  verified      BOOLEAN       DEFAULT FALSE,
  embedding     vector(384),
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);


-- ── USERS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT          DEFAULT '',
  city          TEXT          DEFAULT 'Toronto',
  price_ceiling DECIMAL(6,2)  DEFAULT 15.00,
  cuisine_prefs TEXT[]        DEFAULT '{}',
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);


-- ── BOOKMARKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id    UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  note       TEXT        DEFAULT '',
  visited    BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, spot_id)
);


-- ── CONVERSATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  messages   JSONB       NOT NULL DEFAULT '[]',
  context    JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── REVIEWS (Phase 2) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spot_id      UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worth_it     BOOLEAN NOT NULL,
  actual_spend DECIMAL(6,2),
  comment      TEXT        DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (spot_id, user_id)
);


-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS spots_city_idx     ON spots (city);
CREATE INDEX IF NOT EXISTS spots_category_idx ON spots (category);
CREATE INDEX IF NOT EXISTS spots_price_idx    ON spots (price_min, price_max);
CREATE INDEX IF NOT EXISTS spots_verified_idx ON spots (verified);
CREATE INDEX IF NOT EXISTS spots_pick_idx     ON spots (buco_pick) WHERE buco_pick = TRUE;
CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks (user_id);
CREATE INDEX IF NOT EXISTS conv_user_idx      ON conversations (user_id);

-- Uncomment once you have 500+ spots:
-- CREATE INDEX spots_embedding_idx ON spots USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);


-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE spots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spots_public_read"   ON spots FOR SELECT USING (verified = TRUE);
CREATE POLICY "users_own_profile"   ON users FOR ALL   USING (auth.uid() = id);
CREATE POLICY "bookmarks_own"       ON bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "conversations_own"   ON conversations FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "reviews_public_read" ON reviews FOR SELECT USING (TRUE);
CREATE POLICY "reviews_own_write"   ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ── SEED DATA — Toronto Launch (15 verified spots) ────────────────────────────
INSERT INTO spots (name, category, cuisine_tags, address, city, lat, lng, price_min, price_max, website, buco_pick, buco_score, verified) VALUES
  ('Sansotei Ramen',          'restaurant', ARRAY['japanese','ramen'],             '179 Baldwin St',         'Toronto', 43.6569,-79.3986, 12.00,15.00, 'https://sansotei.com', TRUE,  9.2, TRUE),
  ('Hokkaido Ramen Santouka', 'restaurant', ARRAY['japanese','ramen'],             '91 Dundas St W',         'Toronto', 43.6534,-79.3839, 13.00,16.00, '',                    FALSE, 8.5, TRUE),
  ('Ramen Isshin',            'restaurant', ARRAY['japanese','ramen'],             '421 Bloor St W',         'Toronto', 43.6650,-79.4097, 11.00,14.00, '',                    FALSE, 8.3, TRUE),
  ('Lahore Tikka House',      'restaurant', ARRAY['indian','pakistani','halal'],   '1365 Gerrard St E',      'Toronto', 43.6680,-79.3330,  8.00,12.00, '',                    TRUE,  9.5, TRUE),
  ('Bhatti Indian Grill',     'restaurant', ARRAY['indian','street food'],         '955 Bloor St W',         'Toronto', 43.6611,-79.4257,  9.00,13.00, '',                    FALSE, 8.1, TRUE),
  ('Udupi Palace',            'restaurant', ARRAY['south indian','vegetarian'],    '1460 Gerrard St E',      'Toronto', 43.6681,-79.3305,  7.00,11.00, '',                    FALSE, 8.0, TRUE),
  ('Golden Turtle',           'restaurant', ARRAY['vietnamese','pho'],             '125 Ossington Ave',      'Toronto', 43.6456,-79.4221, 10.00,14.00, '',                    TRUE,  9.0, TRUE),
  ('Rol San',                 'restaurant', ARRAY['chinese','dim sum'],            '323 Spadina Ave',        'Toronto', 43.6527,-79.3985,  9.00,14.00, '',                    FALSE, 8.4, TRUE),
  ('Banh Mi Boys',            'restaurant', ARRAY['vietnamese','sandwiches'],      '392 Queen St W',         'Toronto', 43.6490,-79.4001,  6.00,10.00, 'https://banhmiboys.com', TRUE, 9.3, TRUE),
  ('Ali Baba',                'restaurant', ARRAY['middle eastern','shawarma'],    '15 Wellesley St W',      'Toronto', 43.6647,-79.3863,  7.00,11.00, '',                    FALSE, 8.2, TRUE),
  ('Polished Beauty Bar',     'salon',      ARRAY['nails','manicure','pedicure'],  '620 King St W',          'Toronto', 43.6443,-79.4035, 38.00,55.00, '',                    TRUE,  8.8, TRUE),
  ('Nails by Nina',           'salon',      ARRAY['nails','gel','acrylic'],        '109 Ossington Ave',      'Toronto', 43.6460,-79.4213, 30.00,52.00, '',                    FALSE, 8.0, TRUE),
  ('Beauty Box Salon',        'salon',      ARRAY['hair','colour','cut'],          '880 Bloor St W',         'Toronto', 43.6605,-79.4237, 45.00,85.00, '',                    FALSE, 7.9, TRUE),
  ('Ideal Coffee',            'cafe',       ARRAY['coffee','espresso'],            '226 Carlton St',         'Toronto', 43.6637,-79.3783,  3.00, 7.00, '',                    TRUE,  9.1, TRUE),
  ('Fika Cafe',               'cafe',       ARRAY['coffee','pastries'],            '564 Parliament St',      'Toronto', 43.6636,-79.3706,  4.00, 9.00, '',                    FALSE, 8.6, TRUE);
