-- 20260417120000_strip_legacy_markdown.sql
--
-- One-shot cleanup of legacy markdown markers in entry titles and bodies so
-- the source of truth on disk is plain text — matching the new app behaviour
-- (markdown is no longer generated; the renderer also strips at read time as
-- a transitional palliative).
--
-- Strips:
--   - leading `### ` / `## ` / `# ` (headings)
--   - leading `> ` (blockquotes)
--   - leading `- ` / `* ` (list bullets — `1. ` numbered bullets are left alone)
--   - emphasis around words: **bold** / __bold__ / *italic* / _italic_ / ~~strike~~
--
-- Idempotent: re-running on already-cleaned text is a no-op. Wrapped in a
-- transaction so a failure rolls back without partial damage.

BEGIN;

-- Helper: strip the markers from a single text value.
CREATE OR REPLACE FUNCTION public._strip_legacy_markdown(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := COALESCE(t, '');
BEGIN
  IF s = '' THEN RETURN s; END IF;
  -- Leading heading markers (#, ##, ###, …)
  s := regexp_replace(s, '(^|\n)#{1,6}\s+', '\1', 'g');
  -- Leading blockquote markers (>)
  s := regexp_replace(s, '(^|\n)>\s+', '\1', 'g');
  -- Leading list bullets (- or *)
  s := regexp_replace(s, '(^|\n)[-*]\s+', '\1', 'g');
  -- Emphasis: **bold** / __bold__
  s := regexp_replace(s, '\*\*([^\*\n]+?)\*\*', '\1', 'g');
  s := regexp_replace(s, '__([^_\n]+?)__', '\1', 'g');
  -- Emphasis: *italic* / _italic_  (single markers — apply after the doubles)
  s := regexp_replace(s, '\*([^\*\n]+?)\*', '\1', 'g');
  s := regexp_replace(s, '_([^_\n]+?)_', '\1', 'g');
  -- Strikethrough: ~~text~~
  s := regexp_replace(s, '~~([^~\n]+?)~~', '\1', 'g');
  RETURN s;
END;
$$;

-- Apply to titles and bodies in entries. Skip rows that don't change.
UPDATE public.entries
SET title_markdown = public._strip_legacy_markdown(title_markdown)
WHERE title_markdown IS NOT NULL
  AND title_markdown <> public._strip_legacy_markdown(title_markdown);

UPDATE public.entries
SET body_markdown = public._strip_legacy_markdown(body_markdown)
WHERE body_markdown IS NOT NULL
  AND body_markdown <> public._strip_legacy_markdown(body_markdown);

-- Drop the helper — it was only needed for this migration.
DROP FUNCTION IF EXISTS public._strip_legacy_markdown(text);

COMMIT;
