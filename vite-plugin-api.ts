/**
 * Vite plugin: handle /api/chart and /api/search-symbols in dev by calling Yahoo (same as Vercel serverless).
 * One command "npm run dev" — no separate API server needed.
 */

import type { Plugin } from 'vite'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname)

function importLib(name: string) {
  return import(pathToFileURL(path.join(projectRoot, 'lib', name)).href)
}

export default function apiPlugin(): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (
          req.method !== 'GET' ||
          (!url.startsWith('/api/chart') &&
            !url.startsWith('/api/search-symbols') &&
            !url.startsWith('/api/quote') &&
            !url.startsWith('/api/news'))
        ) {
          next()
          return
        }
        try {
          const parsed = new URL(url, 'http://localhost')
          if (parsed.pathname === '/api/chart') {
            const symbol = parsed.searchParams.get('symbol') || 'SPY'
            const range = parsed.searchParams.get('range') || '1y'
            const companyName = parsed.searchParams.get('companyName') || parsed.searchParams.get('company_name') || ''
            const startDate = parsed.searchParams.get('startDate') || parsed.searchParams.get('start_date') || ''
            const endDate = parsed.searchParams.get('endDate') || parsed.searchParams.get('end_date') || ''
            const { getChartData } = await importLib('chart-api.js') as { getChartData: (s: string, r: string, opts?: { companyName?: string; startDate?: string; endDate?: string }) => Promise<{ dates: string[]; prices: number[]; symbol: string }> }
            const opts: { companyName?: string; startDate?: string; endDate?: string } = { companyName: companyName || undefined }
            if (startDate) opts.startDate = startDate
            if (endDate) opts.endDate = endDate
            const data = await getChartData(symbol, range, opts)
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify(data))
            return
          }
          if (parsed.pathname === '/api/search-symbols') {
            const q = parsed.searchParams.get('q') || ''
            const { searchSymbols } = await importLib('search-symbols.js') as { searchSymbols: (q: string, opts?: { limit?: number }) => Promise<{ symbol: string; name: string; exchange: string; quoteType: string }[]> }
            const results = await searchSymbols(q, { limit: 20 })
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ results }))
            return
          }
          if (parsed.pathname === '/api/quote') {
            const symbol = parsed.searchParams.get('symbol') || ''
            const { getQuote } = await importLib('quote.js') as { getQuote: (s: string) => Promise<{ price: number; currency: string } | null> }
            const data = await getQuote(symbol)
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            if (!data) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'No quote data found' }))
            } else {
              res.end(JSON.stringify(data))
            }
            return
          }
          if (parsed.pathname === '/api/news') {
            const symbol = parsed.searchParams.get('symbol') || ''
            const from = parsed.searchParams.get('from') || ''
            const to = parsed.searchParams.get('to') || ''
            const limit = Math.max(1, Math.min(20, parseInt(parsed.searchParams.get('limit') || '5', 10) || 5))
            const { getNews } = await importLib('news-api.js') as {
              getNews: (
                symbol: string,
                from: string,
                to: string,
                limit?: number,
              ) => Promise<{ title: string; publisher: string; url: string; publishedAt: string | null; source: string }[]>
            }
            const items = await getNews(symbol, from, to, limit)
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            // Short browser cache — news updates hourly at most for any single period.
            res.setHeader('Cache-Control', 'public, max-age=600')
            res.end(JSON.stringify({ items }))
            return
          }
        } catch (e) {
          console.error('[api-plugin]', e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'API error' }))
          return
        }
        next()
      })
    },
  }
}
