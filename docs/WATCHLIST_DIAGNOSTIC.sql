-- Watchlist diagnostic — paste this into Supabase SQL Editor and share the
-- output. It will tell us whether the `watchlist` table exists, whether RLS is
-- on, what policies are configured, and how many rows the current user can see.
--
-- Run it while signed in to Supabase as the app's auth.uid() owner.

-- 1. Does the table exist and what columns does it have?
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'watchlist'
ORDER BY ordinal_position;

-- 2. Is RLS enabled?
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'watchlist';

-- 3. What policies exist?
SELECT
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'watchlist';

-- 4. Row count visible to the currently-authenticated role (anon/authenticated
--    will be scoped by RLS; service-role sees everything).
SELECT count(*) AS visible_rows FROM public.watchlist;

-- 5. Last 3 rows the current user can see (confirms data shape).
SELECT * FROM public.watchlist ORDER BY created_at DESC LIMIT 3;
