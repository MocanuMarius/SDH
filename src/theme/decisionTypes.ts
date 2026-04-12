/**
 * Central config for decision/action type labels and colors.
 * Use for chips, borders, filters, and charts so tagging is consistent and readable.
 */

import type { ActionType } from '../types/database'
import { getCustomDecisionTypes } from '../utils/customDecisionTypes'

export interface DecisionTypeConfig {
  label: string
  /** Hex or theme key for background/border */
  color: string
  /** For charts: 'buy' | 'sell' | 'other' */
  chartCategory: 'buy' | 'sell' | 'other'
}

const CONFIG: Record<ActionType, DecisionTypeConfig> = {
  buy: { label: 'Buy', color: '#16a34a', chartCategory: 'buy' },
  sell: { label: 'Sell', color: '#dc2626', chartCategory: 'sell' },
  short: { label: 'Short', color: '#b91c1c', chartCategory: 'sell' },
  cover: { label: 'Cover', color: '#0891b2', chartCategory: 'buy' },
  trim: { label: 'Trim', color: '#ea580c', chartCategory: 'sell' },
  hold: { label: 'Hold', color: '#ca8a04', chartCategory: 'other' },
  pass: { label: 'Pass', color: '#64748b', chartCategory: 'other' },
  speculate: { label: 'Speculate', color: '#7c3aed', chartCategory: 'other' },
  add_more: { label: 'Add more', color: '#059669', chartCategory: 'buy' },
  research: { label: 'Research', color: '#0369a1', chartCategory: 'other' },
  watchlist: { label: 'Watchlist', color: '#475569', chartCategory: 'other' },
}

export function getDecisionTypeConfig(type: string | null | undefined): DecisionTypeConfig {
  const t = (type ?? '').toLowerCase()
  if (t in CONFIG) return CONFIG[t as ActionType]
  // Check user-defined custom types
  const custom = getCustomDecisionTypes().find((c) => c.id === type || c.label.toLowerCase() === t)
  if (custom) return { label: custom.label, color: custom.color, chartCategory: 'other' }
  return { label: type ?? 'Other', color: '#64748b', chartCategory: 'other' }
}

export function getDecisionTypeColor(type: string | null | undefined): string {
  return getDecisionTypeConfig(type).color
}

/** Chart-only: map any action type to buy/sell/other for timeline colors */
export function getChartCategory(type: string | null | undefined): 'buy' | 'sell' | 'other' {
  return getDecisionTypeConfig(type).chartCategory
}

export const DECISION_CHART_COLORS = {
  buy: '#16a34a',
  sell: '#dc2626',
  other: '#64748b',
} as const

export { CONFIG as DECISION_TYPE_CONFIG }
