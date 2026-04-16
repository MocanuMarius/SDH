-- 20260416120000_actions_standalone.sql
--
-- Decisions can stand alone (no entry) but must always have:
--   - a user_id (so RLS works without joining to entries), and
--   - a non-empty ticker (the unit of analysis).
--
-- Changes:
--   1. actions.user_id (NEW): NOT NULL, FK to auth.users(id) ON DELETE CASCADE.
--      Backfilled from each action's parent entry.
--   2. actions.entry_id becomes nullable; FK becomes ON DELETE SET NULL — deleting
--      an entry orphans its decisions instead of erasing them. They remain visible
--      on the Ticker page and in analytics.
--   3. actions.ticker gains a non-empty CHECK and loses its '' default, so every
--      decision must identify what it is about.
--   4. RLS policies rewritten to use user_id directly (works for both entry-bound
--      and standalone rows).
--
-- Safety: defensive RAISE EXCEPTION blocks abort the transaction if existing data
-- can't satisfy the new constraints. Wrapped in a single transaction so a failure
-- leaves the schema untouched.

BEGIN;

------------------------------------------------------------
-- 1. user_id column + backfill
------------------------------------------------------------

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.actions a
SET user_id = e.user_id
FROM public.entries e
WHERE a.entry_id = e.id
  AND a.user_id IS NULL;

DO $$
DECLARE
  unfilled_count int;
BEGIN
  SELECT count(*) INTO unfilled_count FROM public.actions WHERE user_id IS NULL;
  IF unfilled_count > 0 THEN
    RAISE EXCEPTION
      'Cannot proceed: % actions still have NULL user_id after backfill '
      '(likely because entry_id was already NULL or pointed at a missing entry). '
      'Investigate with: SELECT id, type, ticker, action_date, entry_id FROM public.actions WHERE user_id IS NULL;',
      unfilled_count;
  END IF;
END $$;

ALTER TABLE public.actions
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_user_id_fkey;

ALTER TABLE public.actions
  ADD CONSTRAINT actions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_actions_user_id ON public.actions(user_id);

------------------------------------------------------------
-- 2. entry_id nullable + orphan-on-delete
------------------------------------------------------------

ALTER TABLE public.actions
  ALTER COLUMN entry_id DROP NOT NULL;

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_entry_id_fkey;

ALTER TABLE public.actions
  ADD CONSTRAINT actions_entry_id_fkey
  FOREIGN KEY (entry_id) REFERENCES public.entries(id) ON DELETE SET NULL;

------------------------------------------------------------
-- 3. Ticker must be non-empty
------------------------------------------------------------

DO $$
DECLARE
  blank_count int;
BEGIN
  SELECT count(*) INTO blank_count FROM public.actions WHERE length(btrim(ticker)) = 0;
  IF blank_count > 0 THEN
    RAISE EXCEPTION
      'Cannot apply non-blank ticker check: % actions have an empty ticker. '
      'Fix or delete them first. Inspect with: '
      'SELECT id, type, action_date, entry_id FROM public.actions WHERE length(btrim(ticker)) = 0;',
      blank_count;
  END IF;
END $$;

ALTER TABLE public.actions
  ALTER COLUMN ticker DROP DEFAULT;

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_ticker_not_blank;

ALTER TABLE public.actions
  ADD CONSTRAINT actions_ticker_not_blank
  CHECK (length(btrim(ticker)) > 0);

------------------------------------------------------------
-- 4. RLS policies rewritten to use user_id (works for standalone rows too)
------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own actions"   ON public.actions;
DROP POLICY IF EXISTS "Users can insert own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can update own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can delete own actions" ON public.actions;

CREATE POLICY "Users can read own actions"
  ON public.actions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own actions"
  ON public.actions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own actions"
  ON public.actions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own actions"
  ON public.actions FOR DELETE
  USING (user_id = auth.uid());

COMMIT;
