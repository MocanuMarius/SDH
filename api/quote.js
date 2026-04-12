/**
 * Vercel serverless: GET /api/quote?symbol=AAPL
 * Returns { price: number, currency: string } from Yahoo Finance.
 */

import { getQuote } from '../lib/quote.js'

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
  const symbol = (req.query.symbol || '').trim()
  if (!symbol) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }
  try {
    const data = await getQuote(symbol)
    if (!data) {
      res.status(404).json({ error: 'No quote data found' })
      return
    }
    res.status(200).json(data)
  } catch (e) {
    console.error('Quote API error:', e.message)
    res.status(500).json({ error: e.message || 'Failed to fetch quote' })
  }
}
