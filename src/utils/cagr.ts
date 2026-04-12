/**
 * Compute annualized CAGR from start date to end date using chart price series.
 * Returns null if insufficient data.
 */

export function computeCagrFromChart(
  dates: string[],
  prices: number[],
  startDate: string
): number | null {
  if (!dates?.length || !prices?.length || dates.length !== prices.length) return null
  const start = startDate.trim()
  if (!start) return null
  let startIdx = -1
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= start && prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
      startIdx = i
      break
    }
  }
  if (startIdx < 0) return null
  let endIdx = startIdx
  for (let i = dates.length - 1; i >= startIdx; i--) {
    if (prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
      endIdx = i
      break
    }
  }
  if (endIdx <= startIdx) return null
  const startPrice = prices[startIdx]
  const endPrice = prices[endIdx]
  if (startPrice <= 0) return null
  const startMs = new Date(dates[startIdx]).getTime()
  const endMs = new Date(dates[endIdx]).getTime()
  const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000)
  if (years <= 0) return null
  const cagr = (endPrice / startPrice) ** (1 / years) - 1
  return Math.max(-1, cagr) // clamp to -100% annualized
}

/** Format CAGR as percentage string, e.g. "+12.5%" or "-3.2%" */
export function formatCagrPercent(cagr: number | null): string {
  if (cagr == null || !Number.isFinite(cagr)) return '—'
  const pct = cagr * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Counterfactual: from a pass date to latest price in the series.
 * Returns total return % and hypothetical outcome for a given investment.
 */
export function computeCounterfactualFromChart(
  dates: string[],
  prices: number[],
  startDate: string,
  hypotheticalAmount: number = 10000
): { totalReturnPct: number | null; hypotheticalEnd: number | null; startPrice: number | null; endPrice: number | null } {
  if (!dates?.length || !prices?.length || dates.length !== prices.length) return { totalReturnPct: null, hypotheticalEnd: null, startPrice: null, endPrice: null }
  const start = startDate.trim()
  if (!start) return { totalReturnPct: null, hypotheticalEnd: null, startPrice: null, endPrice: null }
  let startIdx = -1
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= start && prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
      startIdx = i
      break
    }
  }
  if (startIdx < 0) return { totalReturnPct: null, hypotheticalEnd: null, startPrice: null, endPrice: null }
  let endIdx = startIdx
  for (let i = dates.length - 1; i >= startIdx; i--) {
    if (prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
      endIdx = i
      break
    }
  }
  if (endIdx <= startIdx) return { totalReturnPct: null, hypotheticalEnd: null, startPrice: null, endPrice: null }
  const startPrice = prices[startIdx]
  const endPrice = prices[endIdx]
  if (startPrice <= 0) return { totalReturnPct: null, hypotheticalEnd: null, startPrice: null, endPrice: null }
  const totalReturnPct = (endPrice / startPrice - 1) * 100
  const hypotheticalEnd = hypotheticalAmount * (endPrice / startPrice)
  return { totalReturnPct, hypotheticalEnd, startPrice, endPrice }
}

/**
 * Get price on or nearest before a given date from chart series.
 * Returns null if no valid price.
 */
export function getPriceAtDate(
  dates: string[],
  prices: number[],
  date: string
): number | null {
  if (!dates?.length || !prices?.length || dates.length !== prices.length) return null
  const d = date.trim()
  if (!d) return null
  let idx = -1
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= d && prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
      idx = i
      break
    }
  }
  if (idx < 0) return null
  return prices[idx]
}

/**
 * Compute % change from one date to another (or to latest) in chart series.
 * Returns null if insufficient data.
 */
export function getPctChangeBetween(
  dates: string[],
  prices: number[],
  fromDate: string,
  toDate: string | null
): number | null {
  const priceFrom = getPriceAtDate(dates, prices, fromDate)
  if (priceFrom == null || priceFrom <= 0) return null
  const to = toDate?.trim()
  let priceTo: number | null = to ? getPriceAtDate(dates, prices, to) : null
  if (priceTo == null && dates.length > 0 && prices.length === dates.length) {
    for (let i = dates.length - 1; i >= 0; i--) {
      if (prices[i] != null && Number.isFinite(prices[i]) && prices[i] > 0) {
        priceTo = prices[i]
        break
      }
    }
  }
  if (priceTo == null) return null
  return ((priceTo - priceFrom) / priceFrom) * 100
}

/** Format a delta for display, e.g. "+12.5%" or "-3.2%" */
export function formatDeltaPercent(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Human-readable duration from startDate to endDate (default today).
 * Used for "If you had bought (3 months ago)" — no position size, so we show duration + CAGR only.
 */
export function formatDurationSince(startDate: string, endDate?: string): string {
  const start = new Date(startDate.trim())
  const end = endDate ? new Date(endDate.trim()) : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return ''
  const months = Math.round((end.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
  if (months < 1) return 'less than 1 month'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = months / 12
  if (years < 2) return '1 year'
  return `${Math.round(years)} years`
}
