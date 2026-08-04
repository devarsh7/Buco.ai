-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Collaborative Plans / shared wishlists (Phase 2b)
-- A "plan" is a shared list of spots that friends build together.
-- Run AFTER 004_friends.sql in: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lists (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS list_members (
  list_id  UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);

CREATE TABLE IF NOT EXISTS list_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id    UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  spot_id    UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (list_id, spot_id)
);

CREATE INDEX IF NOT EXISTS list_members_user_idx ON list_members (user_id);
CREATE INDEX IF NOT EXISTS list_items_list_idx   ON list_items (list_id);

ALTER TABLE lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_members_self"      ON list_members;
DROP POLICY IF EXISTS "lists_member_read"       ON lists;
DROP POLICY IF EXISTS "list_items_member_read"  ON list_items;

CREATE POLICY "list_members_self" ON list_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "lists_member_read" ON lists FOR SELECT USING (
  EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = lists.id AND m.user_id = auth.uid())
);
CREATE POLICY "list_items_member_read" ON list_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = list_items.list_id AND m.user_id = auth.uid())
);
-- (backend uses the service-role key and bypasses RLS for writes)
