-- 20260418120000_actions_size_column.sql
--
-- Adds a `size` attribute to public.actions to express how big a directional
-- trade was (tiny / small / medium / large / xl). The timeline chart uses it
-- to scale the light-cone glow height per marker — bigger trade = taller
-- cone, more visual weight.
--
-- Backfill: every existing row gets 'medium' so the chart looks unchanged
-- until the user starts setting sizes on new decisions.
--
-- Only meaningful for directional types (buy, sell, add_more, trim, cover,
-- short, speculate). Non-directional types (pass, research, hold, watchlist)
-- may still carry the column but the chart ignores it.

BEGIN;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS size text DEFAULT 'medium';

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_size_check;

ALTER TABLE public.actions
  ADD CONSTRAINT actions_size_check
  CHECK (size IS NULL OR size IN ('tiny', 'small', 'medium', 'large', 'xl'));

-- Backfill any NULLs (should not exist given the default, but defensive).
UPDATE public.actions SET size = 'medium' WHERE size IS NULL;

COMMENT ON COLUMN public.actions.size IS 'Relative trade size: tiny/small/medium/large/xl. Drives timeline cone height.';

-- Tell PostgREST to refresh its schema cache so the new column is visible to
-- the client immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
