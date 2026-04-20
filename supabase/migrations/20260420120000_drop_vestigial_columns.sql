-- 20260420120000_drop_vestigial_columns.sql
--
-- Drop columns that were left behind when features were retired:
--
--   entries.broker_import_id       — from the broker-import surface
--   entries.broker_trade_id        — (retired 2026-04-17)
--   entries.broker_name
--   entries.is_auto_imported
--
--   outcomes.linked_dividend_id    — from the broker-import surface;
--                                    the type explicitly calls it
--                                    "vestigial — importer is gone;
--                                    column stays harmless" but the
--                                    audit flagged it, so clean it up.
--
-- These columns aren't referenced anywhere in the TypeScript source
-- (see `npm run db:audit` for the check). Dropping them shrinks the
-- table definitions and removes the final traces of the retired
-- broker ingestion path.
--
-- Data loss note: the user confirmed on 2026-04-17 that they no
-- longer want any broker-import data tracking ("remove all logic
-- related to this, I will only track and keep my decisions manual").
-- There is no historical value in keeping the columns populated —
-- the features that read them are gone.

BEGIN;

ALTER TABLE public.entries
  DROP COLUMN IF EXISTS broker_import_id,
  DROP COLUMN IF EXISTS broker_trade_id,
  DROP COLUMN IF EXISTS broker_name,
  DROP COLUMN IF EXISTS is_auto_imported;

ALTER TABLE public.outcomes
  DROP COLUMN IF EXISTS linked_dividend_id;

NOTIFY pgrst, 'reload schema';

COMMIT;
