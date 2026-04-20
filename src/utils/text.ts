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

export type RichSegment =
  | { type: 'text'; value: string }
  | { type: 'ticker'; symbol: string }
  | { type: 'url'; href: string }

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
  // both kinds of tokens in source order.
  const combined = new RegExp(
    `(?<url>${URL_IN_TEXT_REGEX.source})|(?<ticker>${TICKER_IN_TEXT_REGEX.source})`,
    'gi',
  )
  const segments: RichSegment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = combined.exec(stripped)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: stripped.slice(lastIndex, m.index) })
    }
    if (m.groups?.url) {
      segments.push({ type: 'url', href: m[0] })
    } else {
      // The combined regex wraps each branch in its own outer named
      // group, shifting capture-group indices: group 2 is the ENTIRE
      // ticker match ("$AAPL", including the dollar sign), group 3 is
      // the inner symbol capture ("AAPL"). Use group 3, with a
      // defensive `$`-strip on the named group as a fallback in case
      // the alternation order ever changes. Earlier code used `m[2]`
      // which made the renderer prepend `$` to a symbol that already
      // had one, producing visible "$$AAPL" chips everywhere a ticker
      // showed up in editable prose.
      const symbol = (m[3] ?? m.groups?.ticker?.replace(/^\$/, '') ?? '')
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
  return getRichSegments(text).map((s): TickerSegment =>
    s.type === 'url' ? { type: 'text', value: s.href } : s,
  )
}
