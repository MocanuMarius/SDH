/**
 * Sentiment service for Fear & Greed Index integration
 * Fetches weekly market sentiment data from CNN Fear & Greed Index
 * Data is cached locally to minimize API calls
 */

export interface WeeklySentimentBand {
  weekStart: string // YYYY-MM-DD
  weekEnd: string // YYYY-MM-DD
  sentiment: number // -100 (fear) to +100 (greed)
  fngIndex: number // 0-100 (Fear & Greed Index)
  label: string // 'Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'
}

const CACHE_KEY = 'sentiment_bands_cache'
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedData {
  data: WeeklySentimentBand[]
  timestamp: number
}

/**
 * Get Fear & Greed Index label for a given score
 */
function getFngLabel(score: number): string {
  if (score < 25) return 'Extreme Fear'
  if (score < 45) return 'Fear'
  if (score < 55) return 'Neutral'
  if (score < 75) return 'Greed'
  return 'Extreme Greed'
}

/**
 * Convert Fear & Greed Index (0-100) to sentiment score (-100 to +100)
 * FNG 0-25 → Extreme Fear (-100 to -50)
 * FNG 25-45 → Fear (-50 to -20)
 * FNG 45-55 → Neutral (-20 to +20)
 * FNG 55-75 → Greed (+20 to +50)
 * FNG 75-100 → Extreme Greed (+50 to +100)
 */
function fngToSentiment(fngIndex: number): number {
  return (fngIndex - 50) * 2
}

/**
 * Calculate the start of a week (Monday)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is Sunday
  return new Date(d.setDate(diff))
}

/**
 * Get the end of a week (Sunday)
 */
function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 6)
  return d
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Fetch weekly sentiment bands for a date range
 * Uses a mock/fallback implementation since CNN Fear & Greed Index API
 * doesn't have public free access. In production, would integrate with:
 * - Alternative API (e.g., Crypto Fear & Greed Index API)
 * - Manual data updates
 * - Market sentiment calculation from price data
 */
export async function fetchWeeklySentimentBands(
  startDate: string,
  endDate: string
): Promise<WeeklySentimentBand[]> {
  // Check cache first
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) {
    const parsed: CachedData = JSON.parse(cached)
    if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
      return parsed.data.filter(
        (band) => band.weekStart >= startDate && band.weekEnd <= endDate
      )
    }
  }

  // For now, return empty array as we don't have public API access
  // In production, would fetch from:
  // 1. CryptoFear & Greed API (crypto-specific)
  // 2. Custom sentiment calculation from market data
  // 3. Manual updates to a database

  const bands = await generateMockSentimentData(startDate, endDate)

  // Cache the result
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      data: bands,
      timestamp: Date.now(),
    } as CachedData)
  )

  return bands
}

/**
 * Generate mock sentiment data for testing/development
 * Uses realistic patterns: lower fear during bull markets, higher during crashes
 */
async function generateMockSentimentData(
  startDateStr: string,
  endDateStr: string
): Promise<WeeklySentimentBand[]> {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  const bands: WeeklySentimentBand[] = []

  const current = getWeekStart(start)
  const mockFngScores: { [key: string]: number } = {
    '2025-01': 35,
    '2025-02': 42,
    '2025-03': 58,
    '2025-04': 65,
    '2025-05': 72,
    '2025-06': 68,
    '2025-07': 75,
    '2025-08': 70,
    '2025-09': 45,
    '2025-10': 52,
    '2025-11': 68,
    '2025-12': 70,
    '2026-01': 55,
    '2026-02': 48,
    '2026-03': 52,
  }

  while (current <= end) {
    const weekEnd = getWeekEnd(current)
    if (weekEnd > end) break

    const key = formatDate(current).slice(0, 7) // YYYY-MM
    const fngIndex = mockFngScores[key] || 50 // default to neutral

    bands.push({
      weekStart: formatDate(current),
      weekEnd: formatDate(weekEnd),
      fngIndex,
      sentiment: fngToSentiment(fngIndex),
      label: getFngLabel(fngIndex),
    })

    current.setDate(current.getDate() + 7)
  }

  return bands
}

/**
 * Clear cached sentiment data
 */
export function clearSentimentCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

/**
 * Get color for sentiment band based on Fear & Greed Index
 * Red (fear) → Gray (neutral) → Green (greed)
 */
export function getSentimentColor(sentiment: number): string {
  // sentiment: -100 (fear) to +100 (greed)
  if (sentiment < -50) return '#dc2626' // red-600: extreme fear
  if (sentiment < -20) return '#ef4444' // red-500: fear
  if (sentiment < 20) return '#94a3b8' // slate-400: neutral
  if (sentiment < 50) return '#4ade80' // green-400: greed
  return '#16a34a' // green-600: extreme greed
}
