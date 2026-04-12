/**
 * Symbol/company search via Yahoo Finance (free, no API key).
 * Returns equities and common securities across exchanges/countries.
 */

const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search'

const DEFAULT_LIMIT = 15

/**
 * @param {string} q - Search query (company name or ticker)
 * @param {{ limit?: number }} opts
 * @returns {Promise<{ symbol: string, name: string, exchange: string, quoteType: string }[]>}
 */
export async function searchSymbols(q, opts = {}) {
  const query = (q || '').trim()
  if (!query) return []
  const limit = Math.min(Number(opts.limit) || DEFAULT_LIMIT, 25)
  const url = `${YAHOO_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Deecide/1.0 (stock decision journal)' },
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  const quotes = data?.quotes || []
  return quotes
    .filter((x) => x && (x.symbol || x.shortname))
    .map((x) => ({
      symbol: (x.symbol || '').trim(),
      name: (x.longname || x.shortname || x.symbol || '').trim(),
      exchange: (x.exchDisp || x.exchange || '').trim(),
      quoteType: (x.quoteType || x.typeDisp || '').trim(),
    }))
    .slice(0, limit)
}
