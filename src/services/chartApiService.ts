/**
 * Fetch S&P / index historical chart data from our API (proxied in dev, serverless in prod).
 * For options (e.g. APP  270115P00200000) we send the underlying (APP) so the chart API can resolve price data.
 */

import { isOptionSymbol, getUnderlyingFromOption } from '../utils/tickerCompany'

export interface ChartData {
  dates: string[]
  prices: number[]
  symbol: string
}

export type ChartRange = '1d' | '5d' | '1m' | '3m' | '6m' | 'ytd' | '1y' | '2y' | '3y' | '5y' | 'max'

export interface ChartDataOptions {
  companyName?: string
  /** YYYY-MM-DD; use with endDate for custom range (e.g. calendar year) */
  startDate?: string
  /** YYYY-MM-DD */
  endDate?: string
}

// In-session chart data cache (~5 min TTL) — prevents redundant API calls when
// multiple components or re-renders request the same ticker+range combo.
const _cache = new Map<string, { data: ChartData; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/** Normalize symbol for chart: collapse spaces, and use underlying when it's an option. */
function symbolForChartRequest(symbol: string): string {
  const normalized = (symbol || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return 'SPY'
  if (isOptionSymbol(normalized)) {
    const underlying = getUnderlyingFromOption(normalized)
    return underlying || normalized
  }
  return normalized
}

export async function fetchChartData(
  symbol: string = 'SPY',
  range: ChartRange = '1y',
  options?: ChartDataOptions
): Promise<ChartData> {
  const chartSymbol = symbolForChartRequest(symbol)
  const cacheKey = `${chartSymbol}:${range}:${options?.startDate ?? ''}:${options?.endDate ?? ''}:${options?.companyName ?? ''}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  const params = new URLSearchParams({ symbol: chartSymbol, range })
  if (options?.companyName?.trim()) params.set('companyName', options.companyName.trim())
  if (options?.startDate?.trim()) params.set('startDate', options.startDate.trim())
  if (options?.endDate?.trim()) params.set('endDate', options.endDate.trim())
  const res = await fetch(`/api/chart?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Chart API error ${res.status} ${res.statusText} for ${chartSymbol}`)
  }
  const data = await res.json() as ChartData
  _cache.set(cacheKey, { data, ts: Date.now() })
  return data
}
