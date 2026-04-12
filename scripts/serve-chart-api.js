/**
 * Local dev server for /api/chart and /api/search-symbols.
 * Run: node scripts/serve-chart-api.js
 * Then in vite.config the proxy /api -> http://localhost:3002
 */

import http from 'node:http'
import { getChartData } from '../lib/chart-api.js'
import { searchSymbols } from '../lib/search-symbols.js'

const PORT = 3002

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  if (req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  if (url.pathname === '/api/search-symbols') {
    const q = url.searchParams.get('q') || ''
    try {
      const results = await searchSymbols(q, { limit: 20 })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
    } catch (e) {
      console.error('Search API error:', e.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message || 'Search failed' }))
    }
    return
  }

  if (url.pathname !== '/api/chart') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }
  const symbol = url.searchParams.get('symbol') || 'SPY'
  const range = url.searchParams.get('range') || '1y'
  const companyName = url.searchParams.get('companyName') || url.searchParams.get('company_name') || ''
  try {
    const data = await getChartData(symbol, range, { companyName: companyName || undefined })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (e) {
    console.error('Chart API error:', e.message)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message || 'Failed to fetch chart data' }))
  }
})

server.listen(PORT, () => {
  console.log(`API at http://localhost:${PORT} — /api/chart, /api/search-symbols (use with Vite proxy)`)
})
