-- Audit log for watchlist alerts: tracks create, edit, trigger, rearm, disable events
CREATE TABLE IF NOT EXISTS public.watchlist_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_item_id UUID REFERENCES public.watchlist_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'edited', 'triggered', 'rearmed', 'disabled', 'enabled')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_audit_item ON public.watchlist_audit_log(watchlist_item_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_audit_created ON public.watchlist_audit_log(created_at DESC);

ALTER TABLE public.watchlist_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on watchlist_audit_log" ON public.watchlist_audit_log
  FOR ALL USING (true) WITH CHECK (true);
