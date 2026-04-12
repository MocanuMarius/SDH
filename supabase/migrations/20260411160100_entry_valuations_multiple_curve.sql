-- Per-year multiple curve for the 3 Engines of Value widget.
-- Stored as a jsonb array of numeric values, length = horizon_years + 1,
-- where index i is the multiple at year i. NULL means "linearly interpolate
-- from current_multiple to target_multiple over the horizon" (the old behaviour).
--
-- This lets the user draw scenarios like: multiple compresses Y2-Y3, rebounds
-- only at Y5. Combined with a constant earnings growth this makes the FCF-per-
-- share math richer because buybacks can be modelled at depressed multiples.

ALTER TABLE public.entry_valuations
  ADD COLUMN IF NOT EXISTS multiple_curve jsonb DEFAULT NULL;

COMMENT ON COLUMN public.entry_valuations.multiple_curve IS 'Per-year valuation multiples (jsonb array). NULL = linear interpolation between current_multiple and target_multiple.';
