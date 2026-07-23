-- ════════════════════════════════════════════════════════════════════════════
-- BUCO — Migration 003: happy hour windows
-- Format per weekday (mon..sun):
--   {"fri": [{"start":"16:00","end":"18:00","deals":[{"item":"cocktails","price":8}]}]}
--
-- ⚠ SAMPLE DATA for development/demo — verify each venue's real happy hour
--   before launch. Replace freely; the app reads whatever is in this column.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE spots SET happy_hour = '{
  "mon": [{"start":"15:00","end":"18:00","deals":[{"item":"banh mi","price":5}]}],
  "tue": [{"start":"15:00","end":"18:00","deals":[{"item":"banh mi","price":5}]}],
  "wed": [{"start":"15:00","end":"18:00","deals":[{"item":"banh mi","price":5}]}],
  "thu": [{"start":"15:00","end":"18:00","deals":[{"item":"banh mi","price":5}]}],
  "fri": [{"start":"15:00","end":"18:00","deals":[{"item":"banh mi","price":5}]}]
}'::jsonb WHERE name = 'Banh Mi Boys';

UPDATE spots SET happy_hour = '{
  "mon": [{"start":"14:00","end":"17:00","deals":[{"item":"dim sum plates","price":4}]}],
  "tue": [{"start":"14:00","end":"17:00","deals":[{"item":"dim sum plates","price":4}]}],
  "wed": [{"start":"14:00","end":"17:00","deals":[{"item":"dim sum plates","price":4}]}],
  "thu": [{"start":"14:00","end":"17:00","deals":[{"item":"dim sum plates","price":4}]}]
}'::jsonb WHERE name = 'Rol San';

UPDATE spots SET happy_hour = '{
  "mon": [{"start":"14:00","end":"16:00","deals":[{"item":"coffee + pastry","price":6}]}],
  "tue": [{"start":"14:00","end":"16:00","deals":[{"item":"coffee + pastry","price":6}]}],
  "wed": [{"start":"14:00","end":"16:00","deals":[{"item":"coffee + pastry","price":6}]}],
  "thu": [{"start":"14:00","end":"16:00","deals":[{"item":"coffee + pastry","price":6}]}],
  "fri": [{"start":"14:00","end":"16:00","deals":[{"item":"coffee + pastry","price":6}]}]
}'::jsonb WHERE name = 'Fika Cafe';

UPDATE spots SET happy_hour = '{
  "fri": [{"start":"16:00","end":"19:00","deals":[{"item":"pho + drink","price":10}]}],
  "sat": [{"start":"16:00","end":"19:00","deals":[{"item":"pho + drink","price":10}]}]
}'::jsonb WHERE name = 'Golden Turtle';
