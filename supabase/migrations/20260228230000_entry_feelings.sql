-- v2 parity: Feeling block per entry (Journalytic-style)
-- Score 1-10, label, type (idea | market), optional ticker

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

CREATE POLICY "Users can read own entry_feelings"
  ON public.entry_feelings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can insert own entry_feelings"
  ON public.entry_feelings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can update own entry_feelings"
  ON public.entry_feelings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));

CREATE POLICY "Users can delete own entry_feelings"
  ON public.entry_feelings FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_feelings.entry_id AND e.user_id = auth.uid()));

DROP TRIGGER IF EXISTS entry_feelings_updated_at ON public.entry_feelings;
CREATE TRIGGER entry_feelings_updated_at
  BEFORE UPDATE ON public.entry_feelings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.entry_feelings IS 'v2 parity: optional Feeling block per entry (score 1-10, type idea|market).';
