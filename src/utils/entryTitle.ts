/**
 * Derive a display title for an entry when it's untitled but has actions (e.g. Pass ($ATKR)).
 */

const UNTITLED_PATTERNS = /^(\(Untitled\)|Untitled|\s*)$/i

/** Entry created by IBKR sync script (tags include "Automated" or author is "IBKR") */
export function isAutomatedEntry(entry: { tags?: string[]; author?: string | null }): boolean {
  if (entry.tags?.includes('Automated')) return true
  if (entry.tags?.includes('IBKR')) return true
  if (entry.author === 'IBKR') return true
  return false
}

export function isUntitled(title: string | null | undefined): boolean {
  if (title == null) return true
  return UNTITLED_PATTERNS.test(title.trim())
}

export interface ActionForTitle {
  type: string
  ticker?: string | null
}

/**
 * Returns a display title: if entry title is untitled and we have at least one action
 * with a ticker, returns e.g. "Pass ($ATKR)" or "Buy ($AAPL)". Otherwise returns
 * the entry title or "(Untitled)".
 */
export function getEntryDisplayTitle(
  entry: { title_markdown?: string | null },
  actions?: ActionForTitle[] | null
): string {
  const raw = (entry?.title_markdown ?? '').trim()
  if (!isUntitled(raw)) return raw

  if (actions?.length) {
    const first = actions[0]
    const ticker = (first.ticker ?? '').trim().toUpperCase()
    if (ticker) {
      const typeLabel = (first.type ?? 'Decision').replace(/_/g, ' ')
      const capitalized = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)
      return `${capitalized} ($${ticker})`
    }
  }

  return '(Untitled)'
}
