/**
 * Symbol/company search for ticker autocomplete (calls backend /api/search-symbols).
 */

export interface TickerSearchResult {
  symbol: string
  name: string
  exchange: string
  quoteType: string
}

export async function searchTickers(query: string): Promise<TickerSearchResult[]> {
  const q = (query || '')
    .trim()
    .replace(/^\$+/, '') // Strip leading $ characters
    .trim()
  if (!q) return []
  const params = new URLSearchParams({ q })
  const res = await fetch(`/api/search-symbols?${params}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: TickerSearchResult[] }
  return data.results || []
}
