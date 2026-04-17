-- 20260417130000_enable_realtime.sql
--
-- Enable Supabase realtime on the tables the app subscribes to from
-- `src/hooks/useRealtimeSync.ts`. After this runs, INSERT/UPDATE/DELETE on
-- these tables is broadcast to clients over the `supabase_realtime`
-- publication, so another tab/device under the same user sees fresh data
-- without a manual refresh.
--
-- Idempotent: DO blocks skip tables already in the publication.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'actions',
    'entries',
    'outcomes',
    'passed',
    'entry_predictions',
    'entry_feelings',
    'reminders'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
