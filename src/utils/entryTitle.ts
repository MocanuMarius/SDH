/**
 * Derive a display title for an entry when it's untitled but has actions (e.g. Pass ($ATKR)).
 */

const UNTITLED_PATTERNS = /^(\(Untitled\)|Untitled|\s*)$/i

// `isAutomatedEntry` retired alongside the broker-import surface (the
// user keeps decisions manually now). Historical IBKR-tagged rows
// stay in the DB but are no longer treated specially in the UI —
// every entry is just an entry. If callers somewhere still want to
// know "did this row come from a broker sync at some point", the
// `Automated` / `IBKR` tag values are still on those rows.

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
