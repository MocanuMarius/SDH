-- Deliberate-practice framework R7 + R16: track Brier score and calibration
-- per sub-skill, not only in aggregate. Enables "attack your weakest sub-skill"
-- workflows. Values are free-form text so the client can add new sub-skills
-- later without a migration; canonical IDs live in src/types/subSkills.ts.

ALTER TABLE public.entry_predictions
  ADD COLUMN IF NOT EXISTS sub_skill text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_entry_predictions_sub_skill
  ON public.entry_predictions(sub_skill);

COMMENT ON COLUMN public.entry_predictions.sub_skill IS 'R7/R16: which sub-skill this prediction is training (valuation_accuracy, catalyst_timing, etc.)';
