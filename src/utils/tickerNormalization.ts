/**
 * Ticker normalization utilities for handling options and derivatives
 *
 * Examples:
 * - "AMTM 32342" (option) → "AMTM" (underlying)
 * - "AAPL" → "AAPL" (already normalized)
 * - "SPY 500C" (spread notation) → "SPY"
 * - "BRK.B" → "BRK.B" (handles dots)
 */

/**
 * Detect if a ticker symbol is an option or derivative
 * Options typically have:
 * - Space followed by numbers (e.g., "AMTM 32342")
 * - Space followed by option notation (e.g., "SPY 500C", "AAPL 150P")
 */
export function isOption(ticker: string): boolean {
  if (!ticker) return false
  // Match: space + digits, or space + digits + letter(s), or space + letter(s) + digits
  return /\s+\d+|[\s+]\d+[CP]|[\s+][CP]\d+/.test(ticker)
}

/**
 * Extract the underlying ticker from an option symbol
 * Returns the ticker before the first space (or the whole ticker if not an option)
 *
 * Examples:
 * - "AMTM 32342" → "AMTM"
 * - "SPY 500C" → "SPY"
 * - "AAPL" → "AAPL"
 */
export function getUnderlyingTicker(ticker: string): string {
  if (!ticker) return ''

  // Split on space and take the first part (the underlying ticker)
  const parts = ticker.trim().split(/\s+/)
  return parts[0].toUpperCase()
}

/**
 * Normalize a ticker by extracting underlying if it's an option
 * This is the main function to use for data aggregation
 */
export function normalizeTicker(ticker: string | null | undefined): string {
  if (!ticker) return ''

  const cleaned = ticker.trim().toUpperCase()
  if (isOption(cleaned)) {
    return getUnderlyingTicker(cleaned)
  }
  return cleaned
}

/**
 * Group tickers by underlying (useful for analytics)
 * Returns a map of underlying ticker → list of all variants
 *
 * Example:
 * Input: ["AMTM", "AMTM 32342", "SPY", "SPY 500C"]
 * Output: { "AMTM": ["AMTM", "AMTM 32342"], "SPY": ["SPY", "SPY 500C"] }
 */
export function groupByUnderlying(tickers: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}

  tickers.forEach((ticker) => {
    const underlying = normalizeTicker(ticker)
    if (!groups[underlying]) {
      groups[underlying] = []
    }
    if (!groups[underlying].includes(ticker)) {
      groups[underlying].push(ticker)
    }
  })

  return groups
}

/**
 * Merge multiple ticker symbol strings (comma or space separated) into unique underlying tickers
 * Useful for market condition tags that might contain options
 *
 * Example:
 * Input: "AMTM 32342, SPY 500C, AAPL"
 * Output: ["AMTM", "SPY", "AAPL"]
 */
export function normalizeTickerList(tickerString: string): string[] {
  if (!tickerString) return []

  // Split on comma, space, or pipe
  const tickers = tickerString
    .split(/[,\s|]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  // Get unique underlying tickers
  const underlying = tickers.map(normalizeTicker)
  return [...new Set(underlying)].sort()
}

/**
 * Check if two tickers refer to the same underlying position
 * Useful for comparing tickers that might be options
 *
 * Example:
 * isSameTicker("AMTM", "AMTM 32342") → true
 * isSameTicker("AMTM", "SPY") → false
 */
export function isSameTicker(ticker1: string, ticker2: string): boolean {
  return normalizeTicker(ticker1) === normalizeTicker(ticker2)
}
