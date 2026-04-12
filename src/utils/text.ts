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

export type TickerSegment =
  | { type: 'text'; value: string }
  | { type: 'ticker'; symbol: string }

/**
 * Split text into segments of plain text and ticker tokens ($SYMBOL).
 * Use with TickerLinks to render $TICKER as links to the idea detail page.
 */
export function getTickerSegments(text: string | null | undefined): TickerSegment[] {
  if (text == null || typeof text !== 'string' || !text) return []
  const stripped = stripMarkdown(text)
  if (!stripped) return []
  const segments: TickerSegment[] = []
  let lastIndex = 0
  const re = new RegExp(TICKER_IN_TEXT_REGEX.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: stripped.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'ticker', symbol: m[1].toUpperCase() })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < stripped.length) {
    segments.push({ type: 'text', value: stripped.slice(lastIndex) })
  }
  return segments
}
