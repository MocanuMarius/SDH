-- John Huber's "3 Engines of Value" framework: total expected return on a stock
-- decomposes into earnings growth + multiple change + shareholder yield.
--
-- One row per entry (1:1) so we can later join against outcomes to build the
-- "projected engine mix vs what actually drove the return" calibration surface.
-- On delete cascade keeps things clean when an entry is removed.

CREATE TABLE IF NOT EXISTS public.entry_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  -- Earnings or FCF growth, percent per year (can be negative for declining businesses).
  earnings_growth_pct numeric NOT NULL DEFAULT 10,
  -- Valuation multiple (P/E, EV/EBITDA, P/FCF — whatever the user is thinking in).
  current_multiple numeric NOT NULL DEFAULT 18,
  target_multiple numeric NOT NULL DEFAULT 18,
  -- Net shareholder yield = dividend yield + net buyback yield. Negative = dilution.
  shareholder_yield_pct numeric NOT NULL DEFAULT 2,
  -- Horizon in years the user is projecting over.
  horizon_years integer NOT NULL DEFAULT 5 CHECK (horizon_years >= 1 AND horizon_years <= 20),
  -- Optional free-form note (e.g. "assuming no dilution from the pending secondary").
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(entry_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_valuations_entry_id ON public.entry_valuations(entry_id);

ALTER TABLE public.entry_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own valuations"
  ON public.entry_valuations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_valuations.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can insert own valuations"
  ON public.entry_valuations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_valuations.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can update own valuations"
  ON public.entry_valuations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_valuations.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can delete own valuations"
  ON public.entry_valuations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_valuations.entry_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS entry_valuations_updated_at ON public.entry_valuations;
CREATE TRIGGER entry_valuations_updated_at
  BEFORE UPDATE ON public.entry_valuations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.entry_valuations IS 'John Huber 3 Engines of Value: per-entry sketch of expected return split into earnings growth + multiple change + shareholder yield.';
