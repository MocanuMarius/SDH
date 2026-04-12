/**
 * Vercel serverless function: GET /api/chart?symbol=SPY&range=1y
 * Returns { dates: string[], prices: number[], symbol: string } for S&P / index chart.
 */

import { getChartData } from '../lib/chart-api.js'

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
  const symbol = req.query.symbol || 'SPY'
  const range = req.query.range || '1y'
  const companyName = req.query.companyName || req.query.company_name || ''
  const startDate = req.query.startDate || req.query.start_date || ''
  const endDate = req.query.endDate || req.query.end_date || ''
  try {
    const opts = { companyName: companyName || undefined }
    if (startDate) opts.startDate = startDate
    if (endDate) opts.endDate = endDate
    const data = await getChartData(symbol, range, opts)
    res.status(200).json(data)
  } catch (e) {
    console.error('Chart API error:', e.message)
    res.status(500).json({ error: e.message || 'Failed to fetch chart data' })
  }
}
