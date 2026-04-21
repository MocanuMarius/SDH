/**
 * Render-time "smart typography" — transforms straight ASCII
 * punctuation into proper typographic glyphs ("curly quotes", em-
 * dashes, ellipses). Pure display polish — the stored entry body is
 * still plain text on disk, so the "source of truth is plain text"
 * principle from docs/PRINCIPLES.md is untouched. Users type
 * `"`, `'`, `--`, `...` and the reader sees `"`, `'`, `—`, `…`.
 *
 * Why:
 *   Plain straight quotes render as dumb "ticks". Curly quotes are
 *   what every published article since Gutenberg has used. Same
 *   story for `--` vs true em-dashes and `...` vs a real ellipsis
 *   character. This is the single cheapest change that moves the
 *   reading surface from "Notes.app draft" to "published article".
 *
 * Scope:
 *   Applies only to prose rendered via PlainTextWithTickers. Fields
 *   that are supposed to be literal (URLs, ticker symbols, code)
 *   route through different segments and never hit this transform.
 */

/**
 * Transform straight ASCII punctuation into typographic glyphs.
 *
 * Quote orientation heuristic:
 *   - Opening quote when preceded by whitespace / start / an opening
 *     bracket / a dash. These are the only contexts where an opening
 *     quote makes sense.
 *   - Any remaining straight quote is treated as closing (or, for
 *     apostrophes, a possessive/contraction mark — same glyph).
 *
 * Edge cases gracefully tolerated:
 *   - Unbalanced quotes: a lone `"` renders as `"` (closing). Wrong-
 *     direction but still a quote character — graceful degradation.
 *   - Quotes inside URLs: URL-in-text regex rejects URLs containing
 *     `"`, so we never see quotes inside a URL segment. Apostrophes
 *     in URLs are theoretically possible but extremely rare; the
 *     cost if it happens is one mirrored char, link still works.
 */
export function smartTypography(input: string): string {
  if (!input) return input
  return (
    input
      // Triple-dash → em; double-dash → em. En-dash (–) is left for the
      // writer to insert manually since the semantic distinction matters
      // (em = break in thought; en = range) and `-` is too ambiguous.
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2014')
      // Three-or-more dots → proper ellipsis glyph.
      .replace(/\.{3,}/g, '\u2026')
      // Opening double-quote after whitespace / start / bracket / dash.
      .replace(/(^|[\s([{\u2014\u2013])"/g, '$1\u201c')
      // Any remaining straight double-quote → closing.
      .replace(/"/g, '\u201d')
      // Opening single-quote after whitespace / start / bracket / dash.
      .replace(/(^|[\s([{\u2014\u2013])'/g, '$1\u2018')
      // Any remaining straight single-quote → closing / apostrophe.
      .replace(/'/g, '\u2019')
  )
}
