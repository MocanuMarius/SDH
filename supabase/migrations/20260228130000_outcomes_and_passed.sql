-- TraderJournal: outcomes (link to action, P&L, notes) and passed ideas
-- Apply with: npx supabase db push

CREATE TABLE IF NOT EXISTS public.outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  realized_pnl numeric,
  outcome_date date NOT NULL DEFAULT (current_date),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(action_id)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_action_id ON public.outcomes(action_id);

ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outcomes"
  ON public.outcomes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      JOIN public.entries e ON e.id = a.entry_id
      WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own outcomes"
  ON public.outcomes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actions a
      JOIN public.entries e ON e.id = a.entry_id
      WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own outcomes"
  ON public.outcomes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      JOIN public.entries e ON e.id = a.entry_id
      WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own outcomes"
  ON public.outcomes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      JOIN public.entries e ON e.id = a.entry_id
      WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS outcomes_updated_at ON public.outcomes;
CREATE TRIGGER outcomes_updated_at
  BEFORE UPDATE ON public.outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Passed: ideas user passed on (optional "did not buy" with reason)
CREATE TABLE IF NOT EXISTS public.passed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL DEFAULT '',
  passed_date date NOT NULL DEFAULT (current_date),
  reason text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passed_user_id ON public.passed(user_id);
CREATE INDEX IF NOT EXISTS idx_passed_ticker ON public.passed(ticker);

ALTER TABLE public.passed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own passed"
  ON public.passed FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own passed"
  ON public.passed FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own passed"
  ON public.passed FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own passed"
  ON public.passed FOR DELETE USING (auth.uid() = user_id);
