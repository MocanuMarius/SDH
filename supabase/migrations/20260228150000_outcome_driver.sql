-- TraderJournal: outcome driver (thesis vs other) for process vs outcome (v1)
-- "Right for wrong reasons" = process failure when driver = 'other'

ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS driver text DEFAULT NULL;

COMMENT ON COLUMN public.outcomes.driver IS 'What drove the result: thesis (thesis played out) or other (e.g. luck; right for wrong reasons = process failure).';
