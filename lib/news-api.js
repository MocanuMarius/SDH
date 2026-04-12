/**
 * News fetcher used by the /api/news endpoint (Vite plugin + Vercel serverless).
 *
 * Three sources, tried in order and merged:
 *   1. Yahoo Finance search      — best quality for recent per-ticker news
 *   2. Google News RSS           — rolling ~30-day window, no key, fills gaps
 *   3. Finnhub /company-news     — only if FINNHUB_API_KEY is set, goes back ~1 year
 *
 * Always returns at most 5 items, ranked by recency × publisher weight.
 * Items that only have a title but no publishedAt fall to the bottom.
 *
 * Copyright: we only store+return headlines, publisher name, publish date, and
 * source URL. No article body text is fetched, cached, or displayed.
 */

// ─── Publisher weighting ───────────────────────────────────────────────
// Well-known finance desks get a 1.5× recency boost when ranking.
const WEIGHTED_PUBLISHERS = new Set([
  'reuters', 'bloomberg', 'wsj', 'wall street journal', 'financial times', 'ft',
  'cnbc', 'barron\'s', 'barrons', 'morningstar', 'marketwatch', 'seeking alpha',
  'the economist', 'associated press', 'ap', 'axios', 'forbes', 'fortune',
])

function publisherWeight(publisher) {
  if (!publisher) return 1
  const p = publisher.toLowerCase().trim()
  for (const w of WEIGHTED_PUBLISHERS) {
    if (p.includes(w)) return 1.5
  }
  return 1
}

// ─── Yahoo Finance search ──────────────────────────────────────────────

const YAHOO_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search'

/**
 * Yahoo Finance search endpoint — returns per-ticker news for the last ~2 weeks.
 * No key required. Piggybacks on the quote search UI, so it's resilient.
 */
async function fetchYahooNews(symbol, newsCount = 10) {
  const url = new URL(YAHOO_SEARCH)
  url.searchParams.set('q', symbol)
  url.searchParams.set('quotesCount', '0')
  url.searchParams.set('newsCount', String(newsCount))
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Deecide/1.0)' },
    })
    if (!res.ok) return []
    const data = await res.json()
    const items = Array.isArray(data?.news) ? data.news : []
    return items
      .filter((n) => n?.title && n?.link)
      .map((n) => ({
        title: String(n.title),
        publisher: n.publisher ? String(n.publisher) : 'Yahoo Finance',
        url: String(n.link),
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : null,
        source: 'yahoo',
      }))
  } catch {
    return []
  }
}

// ─── Google News RSS ───────────────────────────────────────────────────

/**
 * Minimal RSS-to-JSON parser. We only need title, link, pubDate, source.
 * Regex-based because we don't want a dependency; Google's feed is stable.
 */
function parseGoogleNewsRss(xml) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g
  let m
  while ((m = itemRegex.exec(xml)) !== null) {
    const inner = m[1]
    const title = extractTag(inner, 'title')
    const link = extractTag(inner, 'link')
    const pubDate = extractTag(inner, 'pubDate')
    const source = extractTag(inner, 'source')
    if (!title || !link) continue
    items.push({
      title: decodeEntities(stripCdata(title)),
      publisher: source ? decodeEntities(stripCdata(source)) : 'Google News',
      url: decodeEntities(stripCdata(link)),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      source: 'google',
    })
  }
  return items
}

function extractTag(inner, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = inner.match(re)
  return m ? m[1].trim() : null
}

function stripCdata(s) {
  if (!s) return s
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function decodeEntities(s) {
  if (!s) return s
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Google News search RSS — rolling window, no key, good for recent gaps.
 * We query for both ticker + "stock" so generic strings like "APP" don't pull mobile-app news.
 */
async function fetchGoogleNews(query, maxItems = 10) {
  const url = new URL('https://news.google.com/rss/search')
  url.searchParams.set('q', query)
  url.searchParams.set('hl', 'en-US')
  url.searchParams.set('gl', 'US')
  url.searchParams.set('ceid', 'US:en')
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Deecide/1.0)' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = parseGoogleNewsRss(xml)
    return items.slice(0, maxItems)
  } catch {
    return []
  }
}

// ─── Finnhub (optional, needs API key) ─────────────────────────────────

/**
 * Finnhub company-news endpoint. 1 year of history on free tier, 60 calls/min.
 * No-op if FINNHUB_API_KEY is not set.
 */
async function fetchFinnhubNews(symbol, from, to) {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return []
  const url = new URL('https://finnhub.io/api/v1/company-news')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('token', key)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data
      .filter((n) => n?.headline && n?.url)
      .map((n) => ({
        title: String(n.headline),
        publisher: n.source ? String(n.source) : 'Finnhub',
        url: String(n.url),
        publishedAt: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
        source: 'finnhub',
      }))
  } catch {
    return []
  }
}

// ─── Merge + rank ──────────────────────────────────────────────────────

function dedupeByUrl(items) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    const key = (it.url || '').split('?')[0].split('#')[0]
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/**
 * Filter items to a date range and rank by recency × publisher weight.
 * Items without a publishedAt fall to the bottom. Inclusive on both ends.
 */
function rankAndFilter(items, fromIso, toIso, maxItems) {
  const fromMs = fromIso ? new Date(fromIso).getTime() : -Infinity
  // Cover the whole 'to' day by adding 24h-1ms
  const toMs = toIso ? new Date(toIso).getTime() + 86399999 : Infinity
  const now = Date.now()

  const ranked = items
    .filter((it) => {
      if (!it.publishedAt) return true // keep undated items; they'll sort last
      const t = new Date(it.publishedAt).getTime()
      return t >= fromMs && t <= toMs
    })
    .map((it) => {
      const t = it.publishedAt ? new Date(it.publishedAt).getTime() : 0
      // Recency score 0..1: 1 = now, 0 = 30d ago or older
      const ageDays = (now - t) / 86400000
      const recency = Math.max(0, 1 - Math.min(ageDays, 30) / 30)
      const score = recency * publisherWeight(it.publisher)
      return { ...it, _score: t === 0 ? -1 : score }
    })
    .sort((a, b) => b._score - a._score)

  return ranked.slice(0, maxItems).map(({ _score, ...rest }) => rest)
}

// ─── Public entry point ────────────────────────────────────────────────

/**
 * Fetch merged, ranked, deduplicated news for a symbol in a period.
 *
 *   symbol: ticker string ('SPY' or 'AAPL'). Pass 'SPY' / 'MARKET' / empty for market-wide.
 *   from:   YYYY-MM-DD (inclusive) or null for "no lower bound"
 *   to:     YYYY-MM-DD (inclusive) or null for "up to today"
 *   limit:  max items returned (default 5)
 */
export async function getNews(symbol, from, to, limit = 5) {
  const sym = (symbol || '').trim().toUpperCase()
  const isMarketWide = !sym || sym === 'SPY' || sym === 'MARKET' || sym === '^GSPC'

  // Google News query: make per-ticker queries specific so 'APP' doesn't return
  // mobile-app results. For market-wide, use a broader economy query.
  const googleQuery = isMarketWide
    ? 'stock market economy'
    : `${sym} stock`

  // Fire all sources in parallel — empty arrays from unavailable sources are harmless.
  const [yahoo, google, finnhub] = await Promise.all([
    isMarketWide ? fetchYahooNews('SPY', 10) : fetchYahooNews(sym, 10),
    fetchGoogleNews(googleQuery, 15),
    !isMarketWide && from && to ? fetchFinnhubNews(sym, from, to) : [],
  ])

  const merged = dedupeByUrl([...yahoo, ...google, ...finnhub])
  return rankAndFilter(merged, from || null, to || null, limit)
}
