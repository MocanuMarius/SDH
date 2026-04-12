-- F21: Error taxonomy — tag closed decisions (analytical, informational, behavioral, sizing, timing)
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS error_type text[] DEFAULT NULL;
ALTER TABLE public.outcomes
  DROP CONSTRAINT IF EXISTS outcomes_error_type_check;
ALTER TABLE public.outcomes
  ADD CONSTRAINT outcomes_error_type_check CHECK (
    error_type IS NULL OR error_type <@ ARRAY['analytical', 'informational', 'behavioral', 'sizing', 'timing']::text[]
  );
COMMENT ON COLUMN public.outcomes.error_type IS 'F21: Error taxonomy for weakness profile (Rule 17).';
