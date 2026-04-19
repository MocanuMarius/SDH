-- $DR / $MFCSF "Medical Facilities Corp" name collision — applied fix
--
-- Diagnostic SELECT (run first to confirm before applying):
--
--   SELECT ticker, company_name, COUNT(*) AS row_count, MAX(action_date) AS last_seen
--   FROM actions
--   WHERE UPPER(ticker) IN ('DR', 'MFCSF')
--   GROUP BY ticker, company_name
--   ORDER BY ticker, last_seen DESC;
--
-- 2026-04-19 result against the live DB confirmed:
--
--   ticker | company_name              | row_count | last_seen
--   -------+---------------------------+-----------+-----------
--   DR     | "Medical Facilities Corp" | 1         | 2026-01-01   ← WRONG
--   DR     | NULL                      | 3         | 2025-10-02
--   DR     | ""                        | 3         | 2025-09-08
--   MFCSF  | "Medical Facilities Corp."| 2         | 2025-10-01   (correct, note the period)
--
-- The single $DR row with "Medical Facilities Corp" is wrong — $DR is a
-- different ticker (most commonly Daktronics / Doctor Reddy's / etc.;
-- the user trades it but didn't tag a company name on the older rows).
-- The Tickers list groups by ticker key and takes the LATEST action's
-- company_name, so that one mis-tagged row poisons the whole row.
--
-- Fix: NULL out the wrong label so the Tickers list falls back to just
-- "$DR" with no company name attached. If the user later wants to
-- attach a real company name, they can edit any $DR row in the app.

UPDATE actions
SET    company_name = NULL
WHERE  UPPER(ticker) = 'DR'
  AND  company_name = 'Medical Facilities Corp';

-- Re-run the SELECT above to verify, then refresh /tickers in the app.
-- Expected after the UPDATE: only the $MFCSF row carries the
-- "Medical Facilities Corp." label.
