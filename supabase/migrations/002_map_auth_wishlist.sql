-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Migration 002: accurate map data, auth profiles, conversation titles
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. SPOTS: postal code + accurate coordinates ─────────────────────────────
ALTER TABLE spots ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT '';

-- Corrected addresses + tightened coordinates for the Toronto seed spots.
-- (Three spots had the wrong street entirely.)
UPDATE spots SET address='179 Dundas St W', postal_code='M5G 1Z8', lat=43.655590, lng=-79.386610 WHERE name='Sansotei Ramen';
UPDATE spots SET address='91 Dundas St E',  postal_code='M5B 1E1', lat=43.656480, lng=-79.377250 WHERE name='Hokkaido Ramen Santouka';
UPDATE spots SET address='421 College St',  postal_code='M5T 1T1', lat=43.656400, lng=-79.404900 WHERE name='Ramen Isshin';
UPDATE spots SET postal_code='M4L 1Z3', lat=43.672600, lng=-79.325500 WHERE name='Lahore Tikka House';
UPDATE spots SET postal_code='M6H 1L7', lat=43.661020, lng=-79.426900 WHERE name='Bhatti Indian Grill';
UPDATE spots SET postal_code='M4L 2A2', lat=43.672800, lng=-79.321800 WHERE name='Udupi Palace';
UPDATE spots SET postal_code='M6J 2Z6', lat=43.645120, lng=-79.419800 WHERE name='Golden Turtle';
UPDATE spots SET postal_code='M5T 2E9', lat=43.653900, lng=-79.398300 WHERE name='Rol San';
UPDATE spots SET postal_code='M5V 2A9', lat=43.648900, lng=-79.395300 WHERE name='Banh Mi Boys';
UPDATE spots SET postal_code='M4Y 1E7', lat=43.665000, lng=-79.386300 WHERE name='Ali Baba';
UPDATE spots SET postal_code='M5V 1M6', lat=43.644300, lng=-79.400100 WHERE name='Polished Beauty Bar';
UPDATE spots SET postal_code='M6J 2Z2', lat=43.644800, lng=-79.419650 WHERE name='Nails by Nina';
UPDATE spots SET postal_code='M6H 1L1', lat=43.662400, lng=-79.427600 WHERE name='Beauty Box Salon';
UPDATE spots SET postal_code='M5A 2L3', lat=43.663460, lng=-79.370950 WHERE name='Ideal Coffee';
UPDATE spots SET postal_code='M4X 1P8', lat=43.664230, lng=-79.366980 WHERE name='Fika Cafe';

-- NOTE: for pin-perfect accuracy run `python backend/scripts/geocode_spots.py`
-- after this migration — it re-geocodes every spot's street address via
-- OpenStreetMap and writes exact lat/lng + postal_code back to this table.


-- ── 2. CONVERSATIONS: title for the sidebar ──────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';


-- ── 3. AUTH: auto-create a profile row on signup ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any users who signed up before this trigger existed.
INSERT INTO public.users (id, display_name)
SELECT id, split_part(email, '@', 1) FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ── 4. RLS: allow reading unverified spots that are referenced by bookmarks ──
-- (external Yelp spots saved to a Wishlist have verified = FALSE)
DROP POLICY IF EXISTS "spots_bookmarked_read" ON spots;
CREATE POLICY "spots_bookmarked_read" ON spots FOR SELECT
  USING (id IN (SELECT spot_id FROM bookmarks WHERE user_id = auth.uid()));
