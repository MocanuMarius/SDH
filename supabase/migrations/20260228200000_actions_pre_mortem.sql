-- F22: Pre-mortem — optional "assume this fails" block per decision (Gary Klein)
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS pre_mortem_text text DEFAULT NULL;
COMMENT ON COLUMN public.actions.pre_mortem_text IS 'F22: If this decision fails, what is the most likely reason?';
