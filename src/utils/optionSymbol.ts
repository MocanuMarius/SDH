/**
 * Parse standard option symbol formats into structured fields.
 *
 * Two formats handled:
 *   1. Human readable: "APP 15JAN27 200 P"  —  TICKER DDMMMYY STRIKE C|P
 *   2. OCC 21-char:    "CVNA  260306C00365000"  —  TICKER(padded 6) YYMMDD C|P STRIKE(8, x1000)
 *
 * Used by the chart + analytics filters to recognise option tickers
 * (so they're excluded from per-stock analytics and routed to the
 * underlying for chart lookup). The broker-import surface that
 * historically flooded the DB with option rows is gone, but the
 * parser stays so any manually-logged option decision still works.
 *
 * Returns null if the string isn't parseable as an option symbol.
 * All fields are pure client-side, no network required.
 */

export interface ParsedOption {
  /** Underlying ticker (e.g. "APP", "CVNA") */
  underlying: string
  /** Option expiration date in ISO YYYY-MM-DD */
  expiry: string
  /** Strike price in quote currency (usually USD) */
  strike: number
  /** 'C' for call, 'P' for put */
  right: 'C' | 'P'
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/** Convert 2-digit year to 4-digit, assuming 20XX for 00-79 and 19XX for 80-99. */
function pivot2DigitYear(yy: number): number {
  return yy < 80 ? 2000 + yy : 1900 + yy
}

/**
 * Human-readable format: `APP 15JAN27 200 P` or `APP 15JAN27 200.5 C`
 * Tokens: [ticker, "DDMONYY", "STRIKE", "C"|"P"]
 */
function parseHumanFormat(symbol: string): ParsedOption | null {
  const parts = symbol.trim().split(/\s+/)
  if (parts.length !== 4) return null
  const [ticker, dateStr, strikeStr, rightStr] = parts
  // Right must be exactly one letter
  if (rightStr !== 'C' && rightStr !== 'P') return null
  // Date: DDMONYY (7 chars) or DMONYY (6 chars)
  const dateMatch = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/)
  if (!dateMatch) return null
  const [, dayStr, monStr, yyStr] = dateMatch
  const monthNum = MONTHS[monStr]
  if (!monthNum) return null
  const day = parseInt(dayStr, 10).toString().padStart(2, '0')
  const year = pivot2DigitYear(parseInt(yyStr, 10))
  const expiry = `${year}-${monthNum}-${day}`
  const strike = parseFloat(strikeStr)
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right: rightStr }
}

/**
 * OCC 21-character format: padded ticker (6) + YYMMDD (6) + C|P (1) + strike (8, x1000).
 * Real-world strings often collapse whitespace so the underlying may be less than 6 chars.
 */
function parseOccFormat(symbol: string): ParsedOption | null {
  // Try to find the YYMMDD-C/P-strike anchor anywhere in the trailing 15 chars.
  // Pattern: 6 digits (date) + 1 letter (C|P) + 8 digits (strike).
  const m = symbol.match(/^(.+?)\s*(\d{6})([CP])(\d{8})$/)
  if (!m) return null
  const [, rawTicker, dateStr, rightStr, strikeStr] = m
  const ticker = rawTicker.trim()
  if (!ticker) return null
  const yy = parseInt(dateStr.slice(0, 2), 10)
  const mm = parseInt(dateStr.slice(2, 4), 10)
  const dd = parseInt(dateStr.slice(4, 6), 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const year = pivot2DigitYear(yy)
  const expiry = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  // Strike is the last 8 digits, divided by 1000.
  const strike = parseInt(strikeStr, 10) / 1000
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right: rightStr as 'C' | 'P' }
}

export function parseOptionSymbol(symbol: string | null | undefined): ParsedOption | null {
  if (!symbol || typeof symbol !== 'string') return null
  const s = symbol.trim()
  if (!s) return null
  // Try OCC first (more structured), then human.
  return parseOccFormat(s) ?? parseHumanFormat(s)
}

/**
 * Days between trade date and option expiry. Returns null if either is missing
 * or unparseable. Negative DTE (already expired) is preserved so callers can decide.
 */
export function computeDteAtOpen(tradeDate: string | null | undefined, expiry: string | null | undefined): number | null {
  if (!tradeDate || !expiry) return null
  const t = new Date(tradeDate).getTime()
  const e = new Date(expiry).getTime()
  if (!Number.isFinite(t) || !Number.isFinite(e)) return null
  return Math.round((e - t) / 86400000)
}

/**
 * Moneyness at the trade date: |strike - underlyingPrice| / underlyingPrice.
 *   0.00  = at-the-money
 *   0.10  = 10% away from strike (either direction)
 *   0.50+ = deep OTM or deep ITM
 *
 * For call options, OTM means underlying < strike. For puts, OTM means underlying > strike.
 * `side` lets the caller distinguish — pass null to get unsigned distance only.
 */
export function computeMoneyness(
  strike: number,
  underlyingPrice: number,
): number | null {
  if (!Number.isFinite(strike) || !Number.isFinite(underlyingPrice) || underlyingPrice === 0) return null
  return Math.abs(strike - underlyingPrice) / underlyingPrice
}

/**
 * True if the option has a DTE at open greater than the LEAP threshold (365 days).
 * LEAPs get a positive contribution in the investment-score signal stack.
 */
export function isLeap(dteAtOpen: number | null): boolean {
  return dteAtOpen != null && dteAtOpen > 365
}

/**
 * Friendly description of an option for headers / subtitles where
 * there's room to spell things out. Returns e.g. "$18 Call · 21 Jan
 * '28" (note the curly apostrophe — looks deliberate, not accidental,
 * in the editorial UI). Returns empty string if the symbol isn't
 * parseable as an option.
 *
 * The compact `$AAPL (C)` form returned by `getTickerDisplayLabel` is
 * still right for chips and dense list rows; this helper is for the
 * cases where the full strike + expiry actually fits.
 */
export function describeOption(symbol: string | null | undefined): string {
  const parsed = parseOptionSymbol(symbol)
  if (!parsed) return ''
  const right = parsed.right === 'C' ? 'Call' : 'Put'
  const strike = formatStrike(parsed.strike)
  const expiry = formatExpiryShort(parsed.expiry)
  return `${strike} ${right} \u00b7 ${expiry}`
}

/** "21 Jan \u201828" — short month + 2-digit year with curly apostrophe. */
function formatExpiryShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const yy = String(d.getFullYear()).slice(-2)
  return `${day} ${mon} \u2019${yy}`
}

/** "$18", "$200.50" — drop trailing .00 / .0 zeros. */
function formatStrike(strike: number): string {
  if (!Number.isFinite(strike)) return ''
  // Format with up to 2 decimal places, then strip trailing zeros.
  const s = strike.toFixed(2).replace(/\.?0+$/, '')
  return `$${s}`
}
