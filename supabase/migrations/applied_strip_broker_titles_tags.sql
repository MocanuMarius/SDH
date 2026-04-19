-- Historical broker-import title + tag cleanup — applied 2026-04-19
--
-- Context: the broker-import surface was retired; existing rows the
-- importer wrote stay in the DB but are now treated as regular manual
-- entries by the UI. They were still flagged by:
--   1. Title prefix "Automated: ..." (e.g. "Automated: Sell $UBER")
--   2. Tags array containing "Automated" and/or "IBKR"
--
-- Both are visual noise once we treat every entry the same. The Node
-- script below was applied via service-role creds; SQL equivalent
-- recorded here for auditability.
--
-- Diagnostic SELECTs to confirm before / after:
--
--   SELECT COUNT(*) FROM entries WHERE title_markdown ILIKE 'Automated:%';
--   SELECT COUNT(*) FROM entries
--     WHERE 'Automated' = ANY(tags) OR 'IBKR' = ANY(tags);
--
-- Result on 2026-04-19 prior to the cleanup:
--   213 rows with the title prefix
--   213 rows with one of the tags
--
-- 1) Strip the "Automated: " prefix from every title that carries it.
--    Case-insensitive on the prefix; the rest of the title is left
--    verbatim ("Sell $NLR 20JUN25 101 C" stays unchanged).

UPDATE entries
SET    title_markdown = regexp_replace(title_markdown, '^Automated:\s*', '', 'i')
WHERE  title_markdown ~* '^Automated:';

-- 2) Strip the "Automated" and "IBKR" tag values, keeping any other
--    tags the user had on those rows.

UPDATE entries
SET    tags = ARRAY(SELECT t FROM unnest(tags) AS t WHERE t NOT IN ('Automated', 'IBKR'))
WHERE  'Automated' = ANY(tags) OR 'IBKR' = ANY(tags);

-- After the run: 213 of 213 updates succeeded for both. The Journal
-- list reads cleanly now — historical broker rows are
-- indistinguishable from manual entries.
--
-- The underlying broker_* columns on `entries` (broker_import_id /
-- broker_trade_id / broker_name / is_auto_imported) are still
-- populated for those rows. Nothing in the app reads them; left in
-- place for forensic purposes.
