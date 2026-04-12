/**
 * Vercel serverless function: GET /api/news?symbol=AAPL&from=2024-01-01&to=2024-03-01&limit=5
 * Returns { items: NewsItem[] } with at most `limit` entries (default 5).
 *
 * Sources are merged + ranked in lib/news-api.js:
 *   - Yahoo Finance search (no key, recent)
 *   - Google News RSS (no key, ~30d window)
 *   - Finnhub /company-news (optional, needs FINNHUB_API_KEY env var)
 */

import { getNews } from '../lib/news-api.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const symbol = req.query.symbol || ''
    const from = req.query.from || ''
    const to = req.query.to || ''
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit || '5', 10) || 5))
    const items = await getNews(symbol, from, to, limit)
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.status(200).json({ items })
  } catch (e) {
    console.error('[api/news]', e)
    res.status(500).json({ error: e instanceof Error ? e.message : 'News API error' })
  }
}
