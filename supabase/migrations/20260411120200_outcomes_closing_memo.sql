-- Deliberate-practice framework R14: after each close, write a 500-word-capped
-- memo. The word limit is enforced client-side (forces precision); at the DB
-- layer we store the raw text with no length constraint so edit history stays
-- simple.

ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS closing_memo text DEFAULT NULL;

COMMENT ON COLUMN public.outcomes.closing_memo IS 'R14: ≤500-word closing memo — original thesis, what happened, reasoning errors, what I would do differently, recurring theme added to the lesson library';
