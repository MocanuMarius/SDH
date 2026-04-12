-- Deliberate-practice framework R19: score every decision on process AND outcome,
-- on a 1-5 scale, independently. Lets us compute process × outcome 2x2 and the
-- process-vs-outcome correlation (R20). The existing binary process_quality /
-- outcome_quality columns remain for backwards compatibility; they can be
-- derived from the 1-5 score if needed (>= 3 ≈ good, < 3 ≈ bad).

ALTER TABLE public.outcomes
  ADD COLUMN IF NOT EXISTS process_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_score integer DEFAULT NULL;

ALTER TABLE public.outcomes
  DROP CONSTRAINT IF EXISTS outcomes_process_score_check,
  DROP CONSTRAINT IF EXISTS outcomes_outcome_score_check;

ALTER TABLE public.outcomes
  ADD CONSTRAINT outcomes_process_score_check
    CHECK (process_score IS NULL OR (process_score >= 1 AND process_score <= 5)),
  ADD CONSTRAINT outcomes_outcome_score_check
    CHECK (outcome_score IS NULL OR (outcome_score >= 1 AND outcome_score <= 5));

COMMENT ON COLUMN public.outcomes.process_score IS 'R19: 1-5 process quality (research, reasoning, bias-awareness, rule-following)';
COMMENT ON COLUMN public.outcomes.outcome_score IS 'R19: 1-5 outcome quality (did the trade make money)';
