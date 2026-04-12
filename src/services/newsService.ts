/**
 * News service — calls the /api/news endpoint (Yahoo + Google RSS + optional Finnhub).
 *
 * The server does all the fetching + ranking; this file is a thin client with a
 * small in-session cache so repeat Timeline interactions don't refetch the same
 * period within a few minutes.
 *
 * Backwards compatible: the legacy `fetchWeeklyNews(from, to)` signature used by
 * RangeAnalysisPanel still works and returns market-wide news grouped into ISO
 * weeks for the existing rendering.
 */

export interface NewsItem {
  title: string
  publisher: string
  url: string
  /** ISO string or null if publish date unknown */
  publishedAt: string | null
  /** 'yahoo' | 'google' | 'finnhub' — the origin */
  source: string
  /** Optional description (not returned by our API today, kept for compat) */
  description?: string
  /** Legacy field used by some components */
  imageUrl?: string
}

export interface WeeklyNews {
  weekStart: string // YYYY-MM-DD
  weekEnd: string // YYYY-MM-DD
  items: NewsItem[]
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — news changes slowly
const _cache = new Map<string, { ts: number; items: NewsItem[] }>()

/**
 * Fetch headlines for a symbol (or the overall market) within a date range.
 * Defaults: market-wide, ranked top 5.
 */
export async function fetchNewsForPeriod(opts: {
  symbol?: string
  from?: string
  to?: string
  limit?: number
}): Promise<NewsItem[]> {
  const { symbol = '', from = '', to = '', limit = 5 } = opts
  const cacheKey = `${symbol}|${from}|${to}|${limit}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.items

  const params = new URLSearchParams()
  if (symbol) params.set('symbol', symbol)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  params.set('limit', String(limit))
  try {
    const res = await fetch(`/api/news?${params.toString()}`)
    if (!res.ok) {
      _cache.set(cacheKey, { ts: Date.now(), items: [] })
      return []
    }
    const data = (await res.json()) as { items: NewsItem[] }
    const items = Array.isArray(data?.items) ? data.items : []
    _cache.set(cacheKey, { ts: Date.now(), items })
    return items
  } catch {
    _cache.set(cacheKey, { ts: Date.now(), items: [] })
    return []
  }
}

// ─── Legacy API: weekly market news ────────────────────────────────────
// Kept for backwards compatibility with RangeAnalysisPanel. New callers
// should use fetchNewsForPeriod which is more flexible.

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 6)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Fetch market-wide news for a date range, grouped into ISO weeks (Mon–Sun).
 * Each week's items are capped at 5. Backwards-compatible shape.
 */
export async function fetchWeeklyNews(startDate: string, endDate: string): Promise<WeeklyNews[]> {
  // Pull a single merged list for the whole period and bucket it client-side.
  const items = await fetchNewsForPeriod({ symbol: 'SPY', from: startDate, to: endDate, limit: 20 })
  const start = new Date(startDate)
  const end = new Date(endDate)

  const weeks = new Map<string, NewsItem[]>()
  const current = getWeekStart(start)
  while (current <= end) {
    const weekEnd = getWeekEnd(current)
    if (weekEnd > end) break
    weeks.set(formatDate(current), [])
    current.setDate(current.getDate() + 7)
  }

  for (const item of items) {
    if (!item.publishedAt) continue
    const articleDate = new Date(item.publishedAt)
    const weekStart = getWeekStart(articleDate)
    const key = formatDate(weekStart)
    if (weeks.has(key)) weeks.get(key)!.push(item)
  }

  const result: WeeklyNews[] = []
  for (const [weekStartStr, wItems] of weeks) {
    const weekStart = new Date(weekStartStr)
    const weekEnd = getWeekEnd(weekStart)
    result.push({
      weekStart: weekStartStr,
      weekEnd: formatDate(weekEnd),
      items: wItems.slice(0, 5),
    })
  }
  return result.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

export function clearNewsCache(): void {
  _cache.clear()
}
