/**
 * Strip inline markdown so raw ** or * don't show in plain-text displays.
 * Use for reason, notes, and other short fields shown in lists/cards.
 */
export function stripMarkdown(text: string | null | undefined): string {
  if (text == null || typeof text !== 'string') return ''
  return text
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/#+\s?/g, '')
    .replace(/^>\s?/gm, '')      // blockquote markers at start of line
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match $TICKER or $TICKER:EXCHANGE (e.g. $CRC, $SPX, $CSU:TO) */
export const TICKER_IN_TEXT_REGEX = /\$([A-Z0-9.:]+)/gi

/** Match `http://` or `https://` URLs. Greedy on the path/query, but
 *  trailing punctuation that's almost certainly end-of-sentence
 *  (`.,;:!?)`) is excluded so "see https://x.com." doesn't grab the
 *  period. We deliberately skip bare-domain matching ("example.com"
 *  alone) to avoid false positives like "company.com is great" — only
 *  scheme-prefixed URLs become links. */
export const URL_IN_TEXT_REGEX = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g

/** Match `#WATCH SYMBOL` as an inline watchlist-row embed. The
 *  render path picks this up and shows a Bookmark chip linking to
 *  the watchlist page. Symbol shape matches the ticker regex. */
export const WATCH_IN_TEXT_REGEX = /#WATCH\s+([A-Z][A-Z0-9.:]{0,9})/g

export type RichSegment =
  | { type: 'text'; value: string }
  | { type: 'ticker'; symbol: string }
  | { type: 'url'; href: string }
  | { type: 'watch'; symbol: string }

// Back-compat alias — older callers used `TickerSegment`. Same shape
// minus the URL variant; kept as a structural subtype.
export type TickerSegment = Extract<RichSegment, { type: 'text' | 'ticker' }>

/**
 * Split text into rich segments of plain text, ticker tokens
 * ($SYMBOL), and `http(s)://…` URLs. Renderers turn each non-text
 * segment into the appropriate clickable element.
 *
 * Earlier this function only knew about tickers; URL detection was
 * added so editable prose (entry body, decision reasons, outcome
 * notes) renders pasted links as styled `<a href>` elements instead
 * of raw text.
 */
export function getRichSegments(text: string | null | undefined): RichSegment[] {
  if (text == null || typeof text !== 'string' || !text) return []
  const stripped = stripMarkdown(text)
  if (!stripped) return []
  // Combined regex with named groups so a single linear pass finds
  // every kind of token in source order. `watch` is tried first so
  // "#WATCH AAPL" doesn't get split as "#WATCH" + ticker "$AAPL".
  const combined = new RegExp(
    `(?<watch>${WATCH_IN_TEXT_REGEX.source})|(?<url>${URL_IN_TEXT_REGEX.source})|(?<ticker>${TICKER_IN_TEXT_REGEX.source})`,
    'gi',
  )
  const segments: RichSegment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = combined.exec(stripped)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: stripped.slice(lastIndex, m.index) })
    }
    if (m.groups?.watch) {
      // `#WATCH AAPL` → first inner capture is the ticker symbol.
      // Matches group position 2 in the combined regex (watch is
      // the first alternation branch).
      const sym = (m[2] ?? '').toUpperCase()
      segments.push({ type: 'watch', symbol: sym })
    } else if (m.groups?.url) {
      segments.push({ type: 'url', href: m[0] })
    } else {
      // The combined regex wraps each branch in its own outer named
      // group, shifting capture-group indices: group 4 is now the
      // ENTIRE ticker match ("$AAPL", including the dollar sign),
      // group 5 is the inner symbol capture ("AAPL"). The watch
      // branch occupies groups 1–2, url is group 3 (no inner capture),
      // ticker wraps at group 4/5. Defensive `$`-strip on the named
      // `ticker` group as a fallback in case alternation order ever
      // shifts again.
      const symbol = (m[5] ?? m.groups?.ticker?.replace(/^\$/, '') ?? '')
      segments.push({ type: 'ticker', symbol: symbol.toUpperCase() })
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < stripped.length) {
    segments.push({ type: 'text', value: stripped.slice(lastIndex) })
  }
  return segments
}

/**
 * Back-compat wrapper — original `getTickerSegments` callers don't
 * know about URLs; they get only text + ticker segments. URLs land in
 * the text channel for those consumers (which is what they did before
 * URL detection existed).
 */
export function getTickerSegments(text: string | null | undefined): TickerSegment[] {
  return getRichSegments(text).map((s): TickerSegment => {
    if (s.type === 'url') return { type: 'text', value: s.href }
    if (s.type === 'watch') return { type: 'text', value: `#WATCH ${s.symbol}` }
    return s
  })
}
