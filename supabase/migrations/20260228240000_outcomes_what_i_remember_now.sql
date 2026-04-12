-- F29: "Compare then vs now" — optional "what I remember now" when reviewing (surfaces hindsight bias)
ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS what_i_remember_now text DEFAULT NULL;
COMMENT ON COLUMN public.outcomes.what_i_remember_now IS 'F29: When reviewing, optional "what I remember now about my thesis" — compare to pre-decision record to surface hindsight bias (Rule 15).';
