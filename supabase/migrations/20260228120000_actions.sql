-- TraderJournal: actions table (structured decisions: Buy, Sell, etc.)
-- Apply with: npx supabase db push

CREATE TYPE public.action_type_enum AS ENUM (
  'buy',
  'sell',
  'short',
  'trim',
  'hold',
  'pass',
  'speculate',
  'add_more',
  'research',
  'watchlist'
);

CREATE TABLE IF NOT EXISTS public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  type public.action_type_enum NOT NULL DEFAULT 'buy',
  ticker text NOT NULL DEFAULT '',
  company_name text DEFAULT '',
  action_date date NOT NULL DEFAULT (current_date),
  price text DEFAULT '',
  currency text DEFAULT '',
  shares numeric,
  reason text DEFAULT '',
  notes text DEFAULT '',
  raw_snippet text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actions_entry_id ON public.actions(entry_id);
CREATE INDEX IF NOT EXISTS idx_actions_type ON public.actions(type);
CREATE INDEX IF NOT EXISTS idx_actions_ticker ON public.actions(ticker);
CREATE INDEX IF NOT EXISTS idx_actions_action_date ON public.actions(action_date DESC);

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

-- RLS: actions are visible/editable only when the user owns the entry
CREATE POLICY "Users can read own actions"
  ON public.actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = actions.entry_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own actions"
  ON public.actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = actions.entry_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own actions"
  ON public.actions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = actions.entry_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own actions"
  ON public.actions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = actions.entry_id AND e.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS actions_updated_at ON public.actions;
CREATE TRIGGER actions_updated_at
  BEFORE UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
