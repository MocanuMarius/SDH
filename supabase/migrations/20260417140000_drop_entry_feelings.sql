-- 20260417140000_drop_entry_feelings.sql
--
-- Drop the dead `entry_feelings` table. The "Feelings" tab on entries was
-- never used (zero rows across the entire DB) and the app no longer references
-- the table — Market Sentiment is captured on `entries.market_feeling`
-- (a numeric column on `entries`), not in this separate table.
--
-- Removed in code on 2026-04-17. This migration cleans up the schema to match.
-- Safe to re-run: `IF EXISTS` guards keep it idempotent.

BEGIN;

-- Pull the table out of the realtime publication first (no-op if it isn't there).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entry_feelings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.entry_feelings';
  END IF;
END $$;

DROP TABLE IF EXISTS public.entry_feelings CASCADE;

COMMIT;
