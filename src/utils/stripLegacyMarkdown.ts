/**
 * Quietly hide leftover markdown markers from legacy entries (#, **, *, _, >, -)
 * so old content reads as clean prose. Removes only the markers; leaves the words
 * intact. Used in two places:
 *
 *  - At RENDER time by `PlainTextWithTickers`, so historical entries display
 *    cleanly without us touching the database.
 *  - At SAVE time inside the entry form, so the next persist of an entry stores
 *    the cleaned text. Combined, the legacy markdown decays toward zero
 *    naturally as the user edits things.
 *
 * Conservative on emphasis markers: requires a non-space, non-marker character
 * adjacent so a stray `*` in prose ("two * three") isn't eaten as italic.
 */
export function stripLegacyMarkdown(text: string): string {
  if (!text) return text
  return text
    // Leading `### ` / `## ` / `# ` headings → drop the marker, keep the heading words
    .replace(/^(#{1,6})\s+/gm, '')
    // Leading `> ` blockquote prefix
    .replace(/^>\s+/gm, '')
    // Leading list bullets `- ` / `* ` (numeric `1. ` is left alone — common in prose)
    .replace(/^[-*]\s+/gm, '')
    // Strip emphasis markers around words: **bold** / __bold__ / *italic* / _italic_ / ~~strike~~
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(?<![*\w])\*([^*\n]+?)\*(?!\w)/g, '$1')
    .replace(/(?<![_\w])_([^_\n]+?)_(?!\w)/g, '$1')
    .replace(/~~([^~\n]+?)~~/g, '$1')
}
