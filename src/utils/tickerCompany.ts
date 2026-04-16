/**
 * Treat ticker as company, not listing: same company can have different tickers
 * (e.g. CSU vs CSU:TO vs CSU.TO). Normalize to a canonical "company key" for
 * grouping, matching, and chart lookup. Options (e.g. APP 270115P00200000) are
 * normalized to their underlying (APP) so charts and ideas bucket by underlying.
 */

/** True if ticker looks like an option (OCC-style: underlying + date + C/P + strike). */
import { parseOptionSymbol } from './optionSymbol'

export function isOptionSymbol(ticker: string | null | undefined): boolean {
  if (ticker == null || typeof ticker !== 'string') return false
  const t = ticker.trim()
  // Fast path: OCC numeric format (AAPL250117C00150000)
  if (/^\s*[A-Z]+\s*\d{6}[CP]\d+/i.test(t) || /\d{6}[CP]\d{5,}/.test(t)) return true
  // Slow path: human format (CVNA 06MAR26 365 C) via the full parser
  return parseOptionSymbol(t) != null
}

/**
 * Underlying symbol for options. Handles both formats:
 *   OCC:   "APP 270115P00200000" → "APP"
 *   Human: "CVNA 06MAR26 365 C" → "CVNA"
 * Returns empty string if not an option.
 */
export function getUnderlyingFromOption(ticker: string | null | undefined): string {
  if (ticker == null || typeof ticker !== 'string') return ''
  const t = ticker.trim()
  // Fast path: OCC numeric format
  const m = t.toUpperCase().match(/^([A-Z]{1,6})\s*\d{6}[CP]\d+/i)
  if (m) return m[1]
  // Slow path: human format via the full parser
  const parsed = parseOptionSymbol(t)
  return parsed?.underlying ?? ''
}

/** Call / Put / Option tag for display when ticker is an option. */
export function getOptionDisplayTag(ticker: string | null | undefined): 'Call' | 'Put' | 'Option' | null {
  if (!isOptionSymbol(ticker)) return null
  const t = (ticker ?? '').trim().toUpperCase()
  if (/P\d{5,}$|\s*\d{6}P\d+/i.test(t)) return 'Put'
  if (/C\d{5,}$|\s*\d{6}C\d+/i.test(t)) return 'Call'
  return 'Option'
}

/** Short tag for option type in UI: (C) Call, (P) Put, (Opt) Option. */
function getOptionShortTag(ticker: string | null | undefined): string | null {
  const t = getOptionDisplayTag(ticker)
  if (t === 'Call') return 'C'
  if (t === 'Put') return 'P'
  if (t === 'Option') return 'Opt'
  return null
}

/**
 * Display label for ticker: for options returns "$UNDERLYING (C)" or "$UNDERLYING (P)" etc.;
 * for stocks returns "$TICKER". Use for chips and list labels. (C)/(P) is as visible as buy/sell.
 */
export function getTickerDisplayLabel(ticker: string | null | undefined): string {
  if (ticker == null || typeof ticker !== 'string' || !ticker.trim()) return ''
  const underlying = getUnderlyingFromOption(ticker)
  const shortTag = getOptionShortTag(ticker)
  if (underlying && shortTag) return `$${underlying} (${shortTag})`
  return `$${ticker.trim()}`
}

/**
 * Canonical key for grouping tickers that refer to the same security across listings.
 *
 * Rules:
 *   • Options collapse to underlying ("APP 270115P00200000" → "APP").
 *   • Canadian dual listings collapse: "CSU:TO", "CSU.TO", "CSU.NE" → "CSU".
 *   • Everything else keeps its suffix: "MTX.DE" stays "MTX.DE" (German MTU
 *     Aero ≠ US MTX). Earlier code stripped ALL dot/colon suffixes which
 *     silently merged different securities and routed users to wrong charts.
 */
const CANADIAN_DUAL_LIST_SUFFIXES = /(?:[.:](TO|V|NE|CN))$/i

export function normalizeTickerToCompany(ticker: string | null | undefined): string {
  if (ticker == null || typeof ticker !== 'string') return ''
  const t = ticker.trim()
  if (!t) return ''
  const underlying = getUnderlyingFromOption(t)
  if (underlying) return underlying
  const upper = t.toUpperCase()
  // Strip Canadian-listing suffix only (these trade the same shares in CAD)
  return upper.replace(CANADIAN_DUAL_LIST_SUFFIXES, '')
}

/** True if both tickers refer to the same company (by normalized key) */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return normalizeTickerToCompany(a) === normalizeTickerToCompany(b)
}

/**
 * Yahoo-style symbol variants to try for chart data (company first, then common listings).
 * For options we use the underlying only (charts show underlying price, not the option).
 */
export function getTickerVariantsForChart(ticker: string | null | undefined): string[] {
  const company = normalizeTickerToCompany(ticker)
  if (!company) return []
  const raw = (ticker ?? '').trim().toUpperCase()
  const seen = new Set<string>()
  const add = (s: string) => {
    if (s && !seen.has(s)) {
      seen.add(s)
      return true
    }
    return false
  }
  const out: string[] = []
  if (!isOptionSymbol(ticker)) {
    if (raw && add(raw)) out.push(raw)
  }
  if (add(company)) out.push(company)
  const suffixes = ['.TO', '.T', '.L', '.US', '.PA', '.DE', '.SW', '.HK', '.EU', '.ST']
  for (const suf of suffixes) {
    const v = company + suf
    if (add(v)) out.push(v)
  }
  return out
}
