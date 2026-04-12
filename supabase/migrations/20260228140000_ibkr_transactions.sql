-- TraderJournal: IBKR transaction history (for reconciliation with journal decisions)
-- Apply with: npx supabase db push

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

CREATE POLICY "Users can read own ibkr_transactions"
  ON public.ibkr_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ibkr_transactions"
  ON public.ibkr_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ibkr_transactions"
  ON public.ibkr_transactions FOR DELETE USING (auth.uid() = user_id);
