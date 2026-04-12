-- Create watchlist items table
CREATE TABLE IF NOT EXISTS public.watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  alert_price DECIMAL(12, 2) NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('<', '>', '<=', '>=', '==', '!=')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  trigger_count INT DEFAULT 0,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create watchlist alert history table
CREATE TABLE IF NOT EXISTS public.watchlist_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_item_id UUID REFERENCES public.watchlist_items(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  price_when_triggered DECIMAL(12, 2),
  alert_price DECIMAL(12, 2),
  condition TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlist_items_status ON public.watchlist_items(status);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_user ON public.watchlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_ticker ON public.watchlist_items(ticker);
CREATE INDEX IF NOT EXISTS idx_watchlist_history_item ON public.watchlist_alert_history(watchlist_item_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_history_triggered ON public.watchlist_alert_history(triggered_at);

-- Enable RLS
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_alert_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies - allow anyone to read/write (single user app)
CREATE POLICY "Allow all operations on watchlist_items" ON public.watchlist_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on watchlist_alert_history" ON public.watchlist_alert_history
  FOR ALL USING (true) WITH CHECK (true);
