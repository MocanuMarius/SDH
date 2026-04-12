-- Post-mortem notes (F13): structured follow-up — what would you do differently?
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS post_mortem_notes text DEFAULT '';

COMMENT ON COLUMN public.outcomes.post_mortem_notes IS 'Structured post-mortem: what happened, where reasoning failed/succeeded, what to do differently (F13).';
