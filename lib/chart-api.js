/**
 * Fetch historical price data from Yahoo Finance chart API.
 * Same company can be listed under different tickers (e.g. CSU vs CSU.TO);
 * we try the requested symbol first, then company base and common listings.
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

const RANGE_MAP = {
  '1d': '1d',
  '5d': '5d',
  '1m': '1mo',
  '3m': '3mo',
  '6m': '6mo',
  'ytd': 'ytd',
  '1y': '1y',
  '2y': '2y',
  '3y': '3y',
  '5y': '5y',
  'max': 'max',
}

/** Base symbol without exchange suffix (CSU:TO / CSU.TO → CSU) */
function companyKey(s) {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().toUpperCase()
  const base = t.split(/[.:]/)[0]
  return (base && base.trim()) || t
}

/** True if symbol looks like an option (OCC-style: underlying + date + C/P + strike). */
function isOptionSymbol(s) {
  if (!s || typeof s !== 'string') return false
  const t = s.trim().toUpperCase()
  return /^[A-Z]+\s*\d{6}[CP]\d+/.test(t) || /\d{6}[CP]\d{5,}/.test(t)
}

/** Underlying for options (e.g. "APP 270115P00200000" → "APP"). Use for chart lookup. */
function getUnderlyingFromOption(s) {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().toUpperCase()
  const m = t.match(/^([A-Z]{1,6})\s*\d{6}[CP]\d+/)
  return m ? m[1] : ''
}

/** Exchange suffixes including Sweden (.ST) for names like Evolution AB → EVO.ST */
const EXCHANGE_SUFFIXES = ['.TO', '.T', '.L', '.US', '.PA', '.DE', '.SW', '.HK', '.EU', '.ST']

/** Variants to try: raw (unless option), company/underlying key, then + exchange suffixes. For options use underlying only. */
function symbolVariants(symbol) {
  const raw = (symbol || '').trim().toUpperCase()
  if (!raw) return []
  const forLookup = isOptionSymbol(raw) ? getUnderlyingFromOption(raw) || raw : raw
  const company = companyKey(forLookup) || forLookup
  const seen = new Set()
  const out = []
  const add = (v) => {
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  if (!isOptionSymbol(raw)) add(raw)
  add(company)
  for (const suf of EXCHANGE_SUFFIXES) {
    add(company + suf)
  }
  return out
}

/**
 * Fetch chart for one symbol (internal; no fallback).
 * @param {string} yahooSymbol
 * @param {string} range - 1m, 3m, 6m, ytd, 1y, 2y, 3y, 5y
 * @param {{ period1?: number, period2?: number }} [dateRange] - optional unix seconds; when set, overrides range
 * @returns {{ dates: string[], prices: number[], symbol: string } | null}
 */
async function fetchOne(yahooSymbol, range, dateRange) {
  const period2 = dateRange?.period2 ?? Math.floor(Date.now() / 1000)
  const period1 = dateRange?.period1
  const params = new URLSearchParams({ interval: '1d', period2: String(period2) })
  if (period1 != null) {
    params.set('period1', String(period1))
  } else {
    const yahooRange = RANGE_MAP[(range || '1y').toLowerCase()] || '1y'
    params.set('range', yahooRange)
  }
  const url = `${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}?${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Deecide/1.0 (stock decision journal)' },
  })
  if (!res.ok) return null
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) return null
  return result
}

/**
 * When direct symbol variants fail, search by company name or symbol and try first matching chart.
 * Prefer equity results; fall back to any quote that returns chart data.
 */
async function trySearchThenChart(searchQuery, range, rawSymbol, dateRange) {
  const { searchSymbols } = await import('./search-symbols.js')
  if (!searchQuery || typeof searchQuery !== 'string') return null
  const q = searchQuery.trim()
  if (!q) return null
  const results = await searchSymbols(q, { limit: 10 })
  if (!results.length) return null
  for (const r of results) {
    const sym = (r.symbol || '').trim()
    if (!sym) continue
    const chart = await fetchOne(sym, range, dateRange)
    if (chart) return { result: chart, usedSymbol: sym }
  }
  return null
}

/**
 * @param {string} symbol - e.g. SPY, CSU, E3G1 (we try variants then search by company name)
 * @param {string} range - 1m, 3m, 6m, ytd, 1y, 3y, 5y
 * @param {{ companyName?: string }} opts - optional company name to search (e.g. "Evolution AB" → EVO.ST)
 * @returns {Promise<{ dates: string[], prices: number[], symbol: string }>}
 */
/**
 * @param {string} [opts.startDate] - YYYY-MM-DD
 * @param {string} [opts.endDate] - YYYY-MM-DD
 */
export async function getChartData(symbol = 'SPY', range = '1y', opts = {}) {
  const rawSymbol = (symbol || '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (!rawSymbol) throw new Error('Symbol is required')
  const companyName = (opts.companyName || '').trim() || null
  let dateRange
  if (opts.startDate || opts.endDate) {
    const start = opts.startDate ? Math.floor(new Date(opts.startDate + 'T00:00:00Z').getTime() / 1000) : undefined
    const end = opts.endDate ? Math.floor(new Date(opts.endDate + 'T23:59:59Z').getTime() / 1000) : Math.floor(Date.now() / 1000)
    dateRange = { period1: start ?? end - 365 * 24 * 3600, period2: end }
  }
  const variants = rawSymbol === 'SPX' ? ['^GSPC'] : symbolVariants(rawSymbol)
  let result = null
  let usedSymbol = rawSymbol
  for (const v of variants) {
    const yahooSym = v === 'SPX' ? '^GSPC' : v
    result = await fetchOne(yahooSym, range, dateRange)
    if (result) {
      usedSymbol = v
      break
    }
  }
  if (!result && (companyName || rawSymbol)) {
    const searchTried = []
    if (companyName) {
      searchTried.push(`company "${companyName}"`)
      const found = await trySearchThenChart(companyName, range, rawSymbol, dateRange)
      if (found) {
        result = found.result
        usedSymbol = found.usedSymbol
      }
    }
    if (!result) {
      searchTried.push(`symbol "${rawSymbol}"`)
      const found = await trySearchThenChart(rawSymbol, range, rawSymbol, dateRange)
      if (found) {
        result = found.result
        usedSymbol = found.usedSymbol
      }
    }
  }
  if (!result) {
    const tried = [`Tried: ${variants.join(', ')}`]
    if (companyName) tried.push(`Searched by company name "${companyName}"`)
    tried.push(`Searched by symbol "${rawSymbol}"`)
    throw new Error(`No chart data for ${rawSymbol}. ${tried.join('. ')}. Symbol may be invalid or delisted.`)
  }
  const timestamps = result.timestamp || []
  const quote = result.indicators?.quote?.[0]
  let closes = (quote && Array.isArray(quote.close) ? quote.close : []).slice(0, timestamps.length)
  const meta = result.meta || {}
  const currentPrice = meta.regularMarketPrice ?? meta.previousClose ?? null
  const dates = timestamps.map((ts) => {
    const d = new Date(ts * 1000)
    return d.toISOString().slice(0, 10)
  })
  let prices = closes.length ? closes : []
  if (prices.length < dates.length) {
    while (prices.length < dates.length) prices.push(null)
  }
  const lastIdx = dates.length - 1
  if (lastIdx >= 0 && (prices[lastIdx] == null || prices[lastIdx] === 0) && currentPrice != null) {
    prices[lastIdx] = currentPrice
  }
  const valid = dates.map((d, i) => (dates[i] && prices[i] != null && Number.isFinite(prices[i]) ? { date: d, price: prices[i] } : null)).filter(Boolean)
  if (valid.length === 0 && currentPrice != null) {
    const today = new Date().toISOString().slice(0, 10)
    dates.push(today)
    prices.push(currentPrice)
  }
  const outSymbol = meta.symbol === '^GSPC' ? 'SPX' : (usedSymbol || companyKey(rawSymbol) || rawSymbol)
  return { dates, prices, symbol: outSymbol }
}
