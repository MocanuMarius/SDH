-- Run this once in Supabase Dashboard → SQL Editor (if you haven't run supabase link + db push)
-- TraderJournal: full schema (profiles, entries, actions, outcomes, passed, ibkr_transactions)

-- 1. Initial schema
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id text NOT NULL UNIQUE,
  date date NOT NULL DEFAULT (current_date),
  author text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  title_markdown text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_user_id ON public.entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON public.entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON public.entries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_tags ON public.entries USING GIN(tags);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own entries" ON public.entries;
DROP POLICY IF EXISTS "Users can insert own entries" ON public.entries;
DROP POLICY IF EXISTS "Users can update own entries" ON public.entries;
DROP POLICY IF EXISTS "Users can delete own entries" ON public.entries;
CREATE POLICY "Users can read own entries" ON public.entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries" ON public.entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON public.entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries" ON public.entries FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS entries_updated_at ON public.entries;
CREATE TRIGGER entries_updated_at BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Actions
DO $$ BEGIN CREATE TYPE public.action_type_enum AS ENUM ('buy','sell','short','trim','hold','pass','speculate','add_more','research','watchlist'); EXCEPTION WHEN duplicate_object THEN null; END $$;

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
DROP POLICY IF EXISTS "Users can read own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can insert own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can update own actions" ON public.actions;
DROP POLICY IF EXISTS "Users can delete own actions" ON public.actions;
CREATE POLICY "Users can read own actions" ON public.actions FOR SELECT USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = actions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can insert own actions" ON public.actions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = actions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can update own actions" ON public.actions FOR UPDATE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = actions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can delete own actions" ON public.actions FOR DELETE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = actions.entry_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS actions_updated_at ON public.actions;
CREATE TRIGGER actions_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS kill_criteria text DEFAULT '';
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS pre_mortem_text text DEFAULT NULL;

-- 3. Outcomes and passed
CREATE TABLE IF NOT EXISTS public.outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  realized_pnl numeric,
  outcome_date date NOT NULL DEFAULT (current_date),
  notes text DEFAULT '',
  driver text DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(action_id)
);
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS driver text DEFAULT NULL;
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS post_mortem_notes text DEFAULT '';
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS process_quality text DEFAULT NULL;
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS outcome_quality text DEFAULT NULL;
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS error_type text[] DEFAULT NULL;
ALTER TABLE public.outcomes DROP CONSTRAINT IF EXISTS outcomes_process_quality_check;
ALTER TABLE public.outcomes DROP CONSTRAINT IF EXISTS outcomes_outcome_quality_check;
ALTER TABLE public.outcomes DROP CONSTRAINT IF EXISTS outcomes_error_type_check;
ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_process_quality_check CHECK (process_quality IS NULL OR process_quality IN ('good', 'bad'));
ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_outcome_quality_check CHECK (outcome_quality IS NULL OR outcome_quality IN ('good', 'bad'));
ALTER TABLE public.outcomes ADD CONSTRAINT outcomes_error_type_check CHECK (error_type IS NULL OR error_type <@ ARRAY['analytical', 'informational', 'behavioral', 'sizing', 'timing']::text[]);
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS what_i_remember_now text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_outcomes_action_id ON public.outcomes(action_id);
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own outcomes" ON public.outcomes;
DROP POLICY IF EXISTS "Users can insert own outcomes" ON public.outcomes;
DROP POLICY IF EXISTS "Users can update own outcomes" ON public.outcomes;
DROP POLICY IF EXISTS "Users can delete own outcomes" ON public.outcomes;
CREATE POLICY "Users can read own outcomes" ON public.outcomes FOR SELECT USING (EXISTS (SELECT 1 FROM public.actions a JOIN public.entries e ON e.id = a.entry_id WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can insert own outcomes" ON public.outcomes FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.actions a JOIN public.entries e ON e.id = a.entry_id WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can update own outcomes" ON public.outcomes FOR UPDATE USING (EXISTS (SELECT 1 FROM public.actions a JOIN public.entries e ON e.id = a.entry_id WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can delete own outcomes" ON public.outcomes FOR DELETE USING (EXISTS (SELECT 1 FROM public.actions a JOIN public.entries e ON e.id = a.entry_id WHERE a.id = outcomes.action_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS outcomes_updated_at ON public.outcomes;
CREATE TRIGGER outcomes_updated_at BEFORE UPDATE ON public.outcomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
DROP POLICY IF EXISTS "Users can read own passed" ON public.passed;
DROP POLICY IF EXISTS "Users can insert own passed" ON public.passed;
DROP POLICY IF EXISTS "Users can update own passed" ON public.passed;
DROP POLICY IF EXISTS "Users can delete own passed" ON public.passed;
CREATE POLICY "Users can read own passed" ON public.passed FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own passed" ON public.passed FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own passed" ON public.passed FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own passed" ON public.passed FOR DELETE USING (auth.uid() = user_id);

-- 4. IBKR transactions
CREATE TABLE IF NOT EXISTS public.ibkr_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_date date NOT NULL,
  account text NOT NULL DEFAULT '',
  description text DEFAULT '',
  transaction_type text NOT NULL DEFAULT '',
  symbol text NOT NULL DEFAULT '',
  quantity numeric,
  price numeric,
  price_currency text DEFAULT '',
  gross_amount numeric,
  commission numeric,
  net_amount numeric,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ibkr_transactions_user_id ON public.ibkr_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ibkr_transactions_tx_date ON public.ibkr_transactions(tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_ibkr_transactions_symbol ON public.ibkr_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_ibkr_transactions_type ON public.ibkr_transactions(transaction_type);

ALTER TABLE public.ibkr_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own ibkr_transactions" ON public.ibkr_transactions;
DROP POLICY IF EXISTS "Users can insert own ibkr_transactions" ON public.ibkr_transactions;
DROP POLICY IF EXISTS "Users can delete own ibkr_transactions" ON public.ibkr_transactions;
CREATE POLICY "Users can read own ibkr_transactions" ON public.ibkr_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ibkr_transactions" ON public.ibkr_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own ibkr_transactions" ON public.ibkr_transactions FOR DELETE USING (auth.uid() = user_id);

-- Reminders (Activity panel)
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'entry_review' CHECK (type IN ('entry_review', 'idea_refresh', 'prediction_ended')),
  reminder_date date NOT NULL,
  note text DEFAULT '',
  ticker text DEFAULT '',
  completed_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_reminder_date ON public.reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_completed_at ON public.reminders(completed_at) WHERE completed_at IS NULL;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;
CREATE POLICY "Users can read own reminders" ON public.reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders" ON public.reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON public.reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON public.reminders FOR DELETE USING (auth.uid() = user_id);

-- v2 parity: Entry predictions (Prediction block)
CREATE TABLE IF NOT EXISTS public.entry_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  probability integer NOT NULL CHECK (probability >= 0 AND probability <= 100),
  end_date date NOT NULL,
  type text NOT NULL DEFAULT 'price',
  label text DEFAULT NULL,
  ticker text DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entry_predictions_entry_id ON public.entry_predictions(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_predictions_end_date ON public.entry_predictions(end_date);
ALTER TABLE public.entry_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own entry_predictions" ON public.entry_predictions;
DROP POLICY IF EXISTS "Users can insert own entry_predictions" ON public.entry_predictions;
DROP POLICY IF EXISTS "Users can update own entry_predictions" ON public.entry_predictions;
DROP POLICY IF EXISTS "Users can delete own entry_predictions" ON public.entry_predictions;
CREATE POLICY "Users can read own entry_predictions" ON public.entry_predictions FOR SELECT USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can insert own entry_predictions" ON public.entry_predictions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can update own entry_predictions" ON public.entry_predictions FOR UPDATE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can delete own entry_predictions" ON public.entry_predictions FOR DELETE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));
DROP TRIGGER IF EXISTS entry_predictions_updated_at ON public.entry_predictions;
CREATE TRIGGER entry_predictions_updated_at BEFORE UPDATE ON public.entry_predictions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- v2 parity: Entry feelings (Feeling block)
CREATE TABLE IF NOT EXISTS public.entry_feelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 1 AND score <= 10),
  label text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'idea' CHECK (type IN ('idea', 'market')),
  ticker text DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entry_feelings_entry_id ON public.entry_feelings(entry_id);
ALTER TABLE public.entry_feelings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own entry_feelings" ON public.entry_feelings;
DROP POLICY IF EXISTS "Users can insert own entry_feelings" ON public.entry_feelings;
DROP POLICY IF EXISTS "Users can update own entry_feelings" ON public.entry_feelings;
DROP POLICY IF EXISTS "Users can delete own entry_feelings" ON public.entry_feelings;
CREATE POLICY "Users can read own entry_feelings" ON public.entry_feelings FOR SELECT USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can insert own entry_feelings" ON public.entry_feelings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can update own entry_feelings" ON public.entry_feelings FOR UPDATE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can delete own entry_feelings" ON public.entry_feelings FOR DELETE USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));
DROP TRIGGER IF EXISTS entry_feelings_updated_at ON public.entry_feelings;
CREATE TRIGGER entry_feelings_updated_at BEFORE UPDATE ON public.entry_feelings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
