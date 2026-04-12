-- Speculation vs Investment lens: per-entry score 0..100.
-- 0   = pure speculation (short-dated, no thesis, degen)
-- 50  = mixed / ambiguous
-- 100 = long-term fundamental investment with full writeup
--
-- investment_score is the signal-stack output (auto-computed from entry body,
-- kill criteria, pre-mortem, wizard origin, option DTE, moneyness, tags, etc).
-- investment_score_override is the user's manual override when the computed
-- value is wrong; when NULL, the UI falls back to investment_score.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS investment_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS investment_score_override integer DEFAULT NULL;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_investment_score_check,
  DROP CONSTRAINT IF EXISTS entries_investment_score_override_check;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_investment_score_check
    CHECK (investment_score IS NULL OR (investment_score >= 0 AND investment_score <= 100)),
  ADD CONSTRAINT entries_investment_score_override_check
    CHECK (investment_score_override IS NULL OR (investment_score_override >= 0 AND investment_score_override <= 100));

CREATE INDEX IF NOT EXISTS idx_entries_investment_score ON public.entries(investment_score);

COMMENT ON COLUMN public.entries.investment_score IS 'Speculation<->Investment continuous score 0..100. Auto-computed from signal stack (writeup length, kill/pre-mortem, wizard origin, option DTE + moneyness, tags).';
COMMENT ON COLUMN public.entries.investment_score_override IS 'User manual override. When NULL, UI displays investment_score.';
