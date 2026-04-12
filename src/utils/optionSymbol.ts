/**
 * Parse IBKR / OCC option symbol formats into structured fields.
 *
 * IBKR uses two formats interchangeably:
 *   1. Human readable: "APP 15JAN27 200 P"  —  TICKER DDMMMYY STRIKE C|P
 *   2. OCC 21-char:    "CVNA  260306C00365000"  —  TICKER(padded 6) YYMMDD C|P STRIKE(8, x1000)
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
 * Real IBKR strings often collapse whitespace so the underlying may be less than 6 chars.
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
