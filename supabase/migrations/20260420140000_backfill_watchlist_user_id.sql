-- 20260420140000_backfill_watchlist_user_id.sql
--
-- Backfill `watchlist_items.user_id` for rows that were created under
-- the old permissive RLS policy (`USING (true)`) and never got a
-- user_id set. With the 2026-04-20 RLS tightening migration these
-- rows become invisible to every authenticated user — the 11 rows
-- all have user_id = null at the time this file was written.
--
-- Strategy: the app is solo-dev right now (single auth user). Attach
-- every orphaned watchlist_items row to that user. If/when the app
-- goes multi-user, this backfill is safe to re-run (no-op on rows
-- that already have a user_id) but of course the ownership guess is
-- only valid while the app has a single user.
--
-- If this migration runs on a DB that has no orphans or no users, it
-- simply does nothing.

BEGIN;

DO $$
DECLARE
  solo_user_id uuid;
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count FROM public.watchlist_items WHERE user_id IS NULL;
  IF orphan_count = 0 THEN
    RAISE NOTICE 'No watchlist_items rows need backfill.';
    RETURN;
  END IF;

  -- Grab the first (only) user. auth.users is the canonical table.
  SELECT id INTO solo_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF solo_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users found — skipping backfill.';
    RETURN;
  END IF;

  UPDATE public.watchlist_items
    SET user_id = solo_user_id
    WHERE user_id IS NULL;
  RAISE NOTICE 'Backfilled % watchlist_items row(s) with user_id %', orphan_count, solo_user_id;
END
$$;

-- Going forward, require user_id on every watchlist_items insert.
ALTER TABLE public.watchlist_items
  ALTER COLUMN user_id SET NOT NULL;

COMMIT;
