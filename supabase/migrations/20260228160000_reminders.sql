-- Reminders: entry review, idea refresh, prediction-ended (Activity panel)
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
CREATE POLICY "Users can read own reminders" ON public.reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders" ON public.reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON public.reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON public.reminders FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.reminders IS 'Activity panel: entry reminders, idea-refresh alerts, prediction-ended. completed_at set when dismissed/done.';
