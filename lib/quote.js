/**
 * Fetch current price + currency for a symbol from Yahoo Finance chart API.
 * Uses v8/finance/chart (v7/quote is auth-gated).
 * Server-side only (avoids CORS).
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

/**
 * @param {string} symbol
 * @returns {Promise<{ price: number, currency: string } | null>}
 */
export async function getQuote(symbol) {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=1d&interval=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Deecide/1.0' },
  })
  if (!res.ok) return null
  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice ?? meta?.previousClose
  if (!price) return null
  return {
    price,
    currency: meta?.currency || 'USD',
  }
}
