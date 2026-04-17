-- 20260417150000_outcomes_catchup_columns.sql
--
-- Catch-up migration for `public.outcomes`: some earlier `ALTER TABLE` migrations
-- (error_type, process_quality, outcome_quality) didn't land on this user's DB,
-- and the app silently failed when trying to insert rows that reference those
-- columns. This migration re-applies them idempotently.
--
-- Symptom: PGRST204 ("Could not find the 'error_type' column of 'outcomes' in
-- the schema cache") when clicking Add outcome.
--
-- Safe to re-run — every ALTER is guarded with IF NOT EXISTS / IF EXISTS.

BEGIN;

------------------------------------------------------------
-- F12: process/outcome 2×2 binary labels
------------------------------------------------------------
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS process_quality text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_quality text DEFAULT NULL;

ALTER TABLE public.outcomes
  DROP CONSTRAINT IF EXISTS outcomes_process_quality_check,
  DROP CONSTRAINT IF EXISTS outcomes_outcome_quality_check;

ALTER TABLE public.outcomes
  ADD CONSTRAINT outcomes_process_quality_check
    CHECK (process_quality IS NULL OR process_quality IN ('good', 'bad')),
  ADD CONSTRAINT outcomes_outcome_quality_check
    CHECK (outcome_quality IS NULL OR outcome_quality IN ('good', 'bad'));

COMMENT ON COLUMN public.outcomes.process_quality IS 'F12: Was the decision process good?';
COMMENT ON COLUMN public.outcomes.outcome_quality IS 'F12: Was the outcome good (e.g. P&L positive)?';

------------------------------------------------------------
-- F21: error taxonomy array (analytical / informational / behavioral / sizing / timing)
------------------------------------------------------------
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS error_type text[] DEFAULT NULL;

ALTER TABLE public.outcomes
  DROP CONSTRAINT IF EXISTS outcomes_error_type_check;

ALTER TABLE public.outcomes
  ADD CONSTRAINT outcomes_error_type_check CHECK (
    error_type IS NULL
    OR error_type <@ ARRAY['analytical', 'informational', 'behavioral', 'sizing', 'timing']::text[]
  );

COMMENT ON COLUMN public.outcomes.error_type IS 'F21: Error taxonomy for weakness profile.';

-- Ask PostgREST to refresh its schema cache so the new columns are visible
-- immediately (otherwise PGRST204 persists for a minute or two).
NOTIFY pgrst, 'reload schema';

COMMIT;
