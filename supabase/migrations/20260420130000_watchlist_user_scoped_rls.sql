-- 20260420130000_watchlist_user_scoped_rls.sql
--
-- Tighten RLS on the three watchlist tables:
--
--   watchlist_items         — row owner is `user_id`
--   watchlist_audit_log     — rows belong to the parent watchlist_item's user
--   watchlist_alert_history — ditto
--
-- Today (found during the 2026-04-20 RLS audit) all three tables have
-- a single policy `USING (true)` that allows any authenticated row
-- access — a latent multi-user bug. The app is solo-dev right now so
-- nothing's leaking yet, but fixing it before we add anyone else is
-- trivially cheaper than fixing it later.
--
-- For watchlist_items: rely on user_id = auth.uid().
-- For the two child tables: join through watchlist_items to find the
-- owning user.
--
-- Rewrites the policies rather than altering them because Postgres
-- doesn't support ALTER POLICY for the USING expression. DROP-then-
-- CREATE preserves RLS enablement because the ROW SECURITY property
-- is on the TABLE, not the policy.

BEGIN;

------------------------------------------------------------
-- watchlist_items
------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can read own watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can insert own watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can update own watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Users can delete own watchlist_items" ON public.watchlist_items;

CREATE POLICY "Users can read own watchlist_items"
  ON public.watchlist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist_items"
  ON public.watchlist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist_items"
  ON public.watchlist_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist_items"
  ON public.watchlist_items FOR DELETE
  USING (auth.uid() = user_id);

------------------------------------------------------------
-- watchlist_audit_log — owned via the parent watchlist_item
------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on watchlist_audit_log" ON public.watchlist_audit_log;
DROP POLICY IF EXISTS "Users can read own watchlist_audit_log" ON public.watchlist_audit_log;
DROP POLICY IF EXISTS "Users can insert own watchlist_audit_log" ON public.watchlist_audit_log;

CREATE POLICY "Users can read own watchlist_audit_log"
  ON public.watchlist_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_items wi
      WHERE wi.id = watchlist_audit_log.watchlist_item_id
        AND wi.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own watchlist_audit_log"
  ON public.watchlist_audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlist_items wi
      WHERE wi.id = watchlist_audit_log.watchlist_item_id
        AND wi.user_id = auth.uid()
    )
  );

------------------------------------------------------------
-- watchlist_alert_history — owned via the parent watchlist_item
------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on watchlist_alert_history" ON public.watchlist_alert_history;
DROP POLICY IF EXISTS "Users can read own watchlist_alert_history" ON public.watchlist_alert_history;
DROP POLICY IF EXISTS "Users can insert own watchlist_alert_history" ON public.watchlist_alert_history;

CREATE POLICY "Users can read own watchlist_alert_history"
  ON public.watchlist_alert_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_items wi
      WHERE wi.id = watchlist_alert_history.watchlist_item_id
        AND wi.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own watchlist_alert_history"
  ON public.watchlist_alert_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlist_items wi
      WHERE wi.id = watchlist_alert_history.watchlist_item_id
        AND wi.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
