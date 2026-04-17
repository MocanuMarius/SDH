/**
 * Compute % return and drawdown for a selected chart range (Google Finance style).
 */

export interface RangeStats {
  startDate: string
  endDate: string
  startPrice: number
  endPrice: number
  pctChange: number
  drawdownPct: number
  /** Annualised CAGR (%). Null when the range is under ~1 month — too short to annualise meaningfully. */
  cagr: number | null
}

/**
 * Percent change from first to last price in the segment.
 */
export function pctChange(prices: number[]): number {
  if (prices.length < 2) return 0
  const start = prices[0]
  const end = prices[prices.length - 1]
  if (!start || !Number.isFinite(start)) return 0
  return ((end - start) / start) * 100
}

/**
 * Maximum drawdown in the segment (peak-to-trough decline as a positive number, e.g. 15 = 15% drawdown).
 */
export function maxDrawdownPct(prices: number[]): number {
  if (prices.length < 2) return 0
  let peak = prices[0]
  let maxDd = 0
  for (let i = 1; i < prices.length; i++) {
    const p = prices[i]
    if (p > peak) peak = p
    if (peak > 0 && Number.isFinite(p)) {
      const dd = ((peak - p) / peak) * 100
      if (dd > maxDd) maxDd = dd
    }
  }
  return maxDd
}

/** Annualised compound growth rate, in %. Null when the window is under ~1 month. */
export function cagrPct(startPrice: number, endPrice: number, startDate: string, endDate: string): number | null {
  if (!(startPrice > 0) || !Number.isFinite(endPrice)) return null
  const startMs = new Date(startDate).getTime()
  const endMs = new Date(endDate).getTime()
  const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000)
  if (!Number.isFinite(years) || years < 0.08) return null
  return (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100
}

export function computeRangeStats(
  data: { date: string; price: number }[],
  startIndex: number,
  endIndex: number
): RangeStats | null {
  const start = Math.max(0, startIndex)
  const end = Math.min(data.length - 1, endIndex)
  if (start >= end || !data[start] || !data[end]) return null
  const slice = data.slice(start, end + 1)
  const prices = slice.map((d) => d.price).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (prices.length < 2) return null
  const startPrice = prices[0]
  const endPrice = prices[prices.length - 1]
  const startDate = slice[0].date
  const endDate = slice[slice.length - 1].date
  return {
    startDate,
    endDate,
    startPrice,
    endPrice,
    pctChange: pctChange(prices),
    drawdownPct: maxDrawdownPct(prices),
    cagr: cagrPct(startPrice, endPrice, startDate, endDate),
  }
}

export function formatRangeStats(stats: RangeStats): string {
  const pct = stats.pctChange >= 0 ? `+${stats.pctChange.toFixed(2)}%` : `${stats.pctChange.toFixed(2)}%`
  const cagrPart = stats.cagr != null
    ? ` (${stats.cagr >= 0 ? '+' : ''}${stats.cagr.toFixed(1)}%/yr)`
    : ''
  return `${pct}${cagrPart} | Drawdown: -${stats.drawdownPct.toFixed(1)}%`
}
