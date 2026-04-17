-- Watchlist diagnostic — UPDATED 2026-04-17 with the correct table names.
--
-- The app uses THREE tables under the watchlist feature, not one:
--   - public.watchlist_items          (the alerts themselves)
--   - public.watchlist_alert_history  (trigger events)
--   - public.watchlist_audit_log      (manual edits / enable-disable events)
--
-- My earlier diagnostic asked about `public.watchlist` (singular) by mistake —
-- that table was never created because the code doesn't use it. The "relation
-- does not exist" error from that query was expected and harmless.
--
-- Run this updated version if you want a health-check. Share the output if
-- anything looks off.

-- 1. Do all three tables exist and what columns do they have?
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('watchlist_items', 'watchlist_alert_history', 'watchlist_audit_log')
ORDER BY table_name, ordinal_position;

-- 2. Is RLS enabled on each?
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('watchlist_items', 'watchlist_alert_history', 'watchlist_audit_log')
ORDER BY tablename;

-- 3. What policies exist? (Gives ownership-scope per table.)
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('watchlist_items', 'watchlist_alert_history', 'watchlist_audit_log')
ORDER BY tablename, policyname;

-- 4. Visible row counts for the currently-authenticated user.
SELECT 'watchlist_items'         AS table_name, count(*) AS visible_rows FROM public.watchlist_items
UNION ALL
SELECT 'watchlist_alert_history', count(*) FROM public.watchlist_alert_history
UNION ALL
SELECT 'watchlist_audit_log',     count(*) FROM public.watchlist_audit_log;

-- 5. Last 3 items and last 3 audit events (confirms data shape).
SELECT * FROM public.watchlist_items      ORDER BY created_at DESC LIMIT 3;
SELECT * FROM public.watchlist_audit_log  ORDER BY created_at DESC LIMIT 3;
