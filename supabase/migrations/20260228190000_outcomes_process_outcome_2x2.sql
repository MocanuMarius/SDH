-- F12: Process/outcome 2×2 — classify closed positions (good/bad process × good/bad outcome)
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS process_quality text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_quality text DEFAULT NULL;
ALTER TABLE public.outcomes
  DROP CONSTRAINT IF EXISTS outcomes_process_quality_check,
  DROP CONSTRAINT IF EXISTS outcomes_outcome_quality_check;
ALTER TABLE public.outcomes
  ADD CONSTRAINT outcomes_process_quality_check CHECK (process_quality IS NULL OR process_quality IN ('good', 'bad')),
  ADD CONSTRAINT outcomes_outcome_quality_check CHECK (outcome_quality IS NULL OR outcome_quality IN ('good', 'bad'));
COMMENT ON COLUMN public.outcomes.process_quality IS 'F12: Was the decision process good?';
COMMENT ON COLUMN public.outcomes.outcome_quality IS 'F12: Was the outcome good (e.g. P&L positive)?';
