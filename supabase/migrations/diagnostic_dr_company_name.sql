-- Diagnostic: $DR / $MFCSF "Medical Facilities Corp" name collision
--
-- The Tickers list (/tickers) showed both $DR and $MFCSF rows with the
-- same company name ("Medical Facilities Corp"). $MFCSF *is* Medical
-- Facilities Corp; $DR almost certainly isn't (DR is most often
-- "Daktronics" / "Doctor Reddy's" / a similar US ticker).
--
-- Run this SELECT first to see what the database actually has:

SELECT ticker, company_name, COUNT(*) AS row_count, MAX(action_date) AS last_seen
FROM actions
WHERE UPPER(ticker) IN ('DR', 'MFCSF')
GROUP BY ticker, company_name
ORDER BY ticker, last_seen DESC;

-- Expected result if the data is wrong:
--   ticker | company_name              | row_count | last_seen
--   -------+---------------------------+-----------+-----------
--   DR     | Medical Facilities Corp   | <some>    | <some>
--   DR     | <whatever it really is>   | <some>    | <some>
--   MFCSF  | Medical Facilities Corp   | <some>    | <some>
--
-- If you see "Medical Facilities Corp" attached to DR rows, fix it with
-- the right company name. Example (replace REPLACEMENT):
--
--   UPDATE actions
--   SET    company_name = 'REPLACEMENT'
--   WHERE  UPPER(ticker) = 'DR'
--     AND  company_name = 'Medical Facilities Corp';
--
-- Re-run the SELECT to verify, then refresh /tickers in the app.
