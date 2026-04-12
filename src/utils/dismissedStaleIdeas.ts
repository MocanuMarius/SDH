/**
 * Permanently dismissed stale-idea tickers (localStorage-backed).
 * When a user dismisses a stale idea, the ticker is stored here
 * and excluded from future Activity Drawer alerts.
 */

const STORAGE_KEY = 'sdh_dismissed_stale_ideas'

export function getDismissedStaleIdeas(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissStaleIdea(ticker: string): void {
  const current = getDismissedStaleIdeas()
  current.add(ticker)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
}

export function undismissStaleIdea(ticker: string): void {
  const current = getDismissedStaleIdeas()
  current.delete(ticker)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
}
