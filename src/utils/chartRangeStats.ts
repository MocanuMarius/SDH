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
  return {
    startDate: slice[0].date,
    endDate: slice[slice.length - 1].date,
    startPrice,
    endPrice,
    pctChange: pctChange(prices),
    drawdownPct: maxDrawdownPct(prices),
  }
}

export function formatRangeStats(stats: RangeStats): string {
  const pct = stats.pctChange >= 0 ? `+${stats.pctChange.toFixed(2)}%` : `${stats.pctChange.toFixed(2)}%`
  return `${pct} | Drawdown: -${stats.drawdownPct.toFixed(1)}%`
}
