-- v2 parity: Prediction block per entry (Journalytic-style)
-- Probability, end date, type (e.g. price), optional label and ticker

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

CREATE POLICY "Users can read own entry_predictions"
  ON public.entry_predictions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can insert own entry_predictions"
  ON public.entry_predictions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can update own entry_predictions"
  ON public.entry_predictions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can delete own entry_predictions"
  ON public.entry_predictions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_predictions.entry_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS entry_predictions_updated_at ON public.entry_predictions;
CREATE TRIGGER entry_predictions_updated_at
  BEFORE UPDATE ON public.entry_predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.entry_predictions IS 'v2 parity: optional Prediction block per entry (probability, end date, type).';
