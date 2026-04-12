-- Kill criteria (F8): pre-commit exit conditions per buy — "If [X], I reassess/sell"
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS kill_criteria text DEFAULT '';

COMMENT ON COLUMN public.actions.kill_criteria IS 'Pre-commit exit conditions: e.g. If [X], I reassess or sell. Annie Duke, Rule 31.';
