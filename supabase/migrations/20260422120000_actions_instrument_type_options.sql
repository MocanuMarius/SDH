-- 20260422120000_actions_instrument_type_options.sql
--
-- Adds first-class support for non-stock instruments on public.actions:
--
--   * `instrument_type` — one of 'stock', 'option', 'futures_option',
--     'other'. Default 'stock' so existing rows are correctly typed
--     without inspection.
--   * `option_expiry`, `option_strike`, `option_right` — structured
--     fields that replace the OCC-string-encoded ticker hack the
--     ActionForm used to compose. New decisions store the underlying
--     in `ticker` and put the contract details in these columns.
--   * `market_value` — optional dollar value of the position at the
--     time of the decision. Optional because for stocks it's already
--     derivable from price * shares, but useful for instruments
--     where that math doesn't hold (futures, exotic structures).
--
-- Backfill: a separate one-shot script
-- (`scripts/backfill-instrument-fields.mjs`) walks rows whose
-- `ticker` parses as an OCC option symbol, sets `instrument_type =
-- 'option'`, and populates `option_expiry / option_strike /
-- option_right` from the parsed values. Existing tickers stay in
-- place to preserve audit history; the display layer prefers the
-- structured columns when present and falls back to ticker parsing
-- otherwise.

BEGIN;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS instrument_type text NOT NULL DEFAULT 'stock';

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_instrument_type_check;
ALTER TABLE public.actions
  ADD CONSTRAINT actions_instrument_type_check
  CHECK (instrument_type IN ('stock', 'option', 'futures_option', 'other'));

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS option_expiry date,
  ADD COLUMN IF NOT EXISTS option_strike numeric(14, 4),
  ADD COLUMN IF NOT EXISTS option_right  char(1);

ALTER TABLE public.actions
  DROP CONSTRAINT IF EXISTS actions_option_right_check;
ALTER TABLE public.actions
  ADD CONSTRAINT actions_option_right_check
  CHECK (option_right IS NULL OR option_right IN ('C', 'P'));

-- Sanity: if instrument_type is 'option' or 'futures_option', the
-- contract fields should be populated. We don't enforce this with a
-- CHECK because some legacy rows may have partial data and a hard
-- fail would block the migration; the form-side validation handles
-- it for new writes.

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS market_value numeric(14, 2);

COMMENT ON COLUMN public.actions.instrument_type IS
  'Instrument category: stock | option | futures_option | other. Drives form fields and display.';
COMMENT ON COLUMN public.actions.option_expiry  IS 'Option expiration (date). Populated when instrument_type is option / futures_option.';
COMMENT ON COLUMN public.actions.option_strike  IS 'Option strike price in quote currency.';
COMMENT ON COLUMN public.actions.option_right   IS 'C = Call, P = Put.';
COMMENT ON COLUMN public.actions.market_value   IS 'Optional notional / market value of the position at decision time, in quote currency.';

-- Refresh PostgREST schema cache so the new columns are visible to
-- the client immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
