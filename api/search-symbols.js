/**
 * Vercel serverless: GET /api/search-symbols?q=apple
 * Returns { results: [{ symbol, name, exchange, quoteType }] } from Yahoo Finance search.
 */

import { searchSymbols } from '../lib/search-symbols.js'

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
  const q = (req.query.q || '').trim()
  try {
    const results = await searchSymbols(q, { limit: 20 })
    res.status(200).json({ results })
  } catch (e) {
    console.error('Search API error:', e.message)
    res.status(500).json({ error: e.message || 'Search failed' })
  }
}
