/**
 * Build Journalytic-style decision block markdown from structured fields.
 * Format: ### Buy Decision 2/21/26 **$TICKER** - Company Name\nPrice: $123.00\nReason: ...
 */

import type { ActionType } from '../types/database'

export type DecisionType = ActionType

export interface DecisionBlockFields {
  type: DecisionType
  ticker: string
  company_name: string
  action_date: string
  price: string
  currency: string
  shares: number | null
  reason: string
  notes: string
}

/** Format date as M/D/YY for the decision line */
function formatDateShort(isoDate: string): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  if (!m || !d) return isoDate
  const year = y ? y.slice(-2) : ''
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${year}`
}

export function buildDecisionBlockMarkdown(f: DecisionBlockFields): string {
  const typeLabel = f.type.charAt(0).toUpperCase() + f.type.slice(1).replace('_', ' ')
  const dateStr = formatDateShort(f.action_date)
  const tickerDisplay = f.ticker.trim() ? `**$${f.ticker.trim()}**` : ''
  const companyPart = f.company_name.trim() ? ` - ${f.company_name.trim()}` : ''
  const cur = f.currency.trim() || '$'
  const priceVal = f.price.trim()
  const priceDisplay = priceVal ? `${cur}${priceVal}` : ''
  const sharesLine =
    f.shares != null && f.shares > 0 && priceDisplay
      ? ` ${f.shares} shares @ ${priceDisplay} per share`
      : priceDisplay
      ? ` Price: ${priceDisplay}`
      : ''
  const reasonStr = f.reason.trim() ? ` ${f.reason.trim()}` : ''

  const firstLine = `### ${typeLabel} Decision ${dateStr} ${tickerDisplay}${companyPart}${sharesLine}${reasonStr}`.trim()
  const lines = [firstLine]

  if (f.notes.trim()) {
    lines.push('')
    lines.push(f.notes.trim())
  }

  return lines.join('\n')
}
