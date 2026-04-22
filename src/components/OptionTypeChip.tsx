/**
 * Small chip showing the option contract details next to the
 * ticker on a decision card. Two ways to drive it:
 *
 *  - Pass `action` (preferred): reads `instrument_type` +
 *    `option_strike` / `option_right` / `option_expiry` from the
 *    structured columns added by migration 20260422120000. Falls
 *    back to ticker-string parsing when the structured fields
 *    aren't yet populated (old OCC-tickered rows).
 *  - Pass `ticker` only: legacy form, parses the ticker string.
 *    Kept so existing callers don't all have to switch at once.
 *
 * Renders nothing when the action / ticker isn't an option.
 */

import { Chip } from '@mui/material'
import { getOptionDisplayTag } from '../utils/tickerCompany'
import { describeOptionFromAction } from '../utils/optionSymbol'
import { isOptionInstrument } from '../types/database'

interface OptionTypeChipProps {
  ticker?: string | null
  action?: {
    instrument_type?: string | null
    ticker?: string | null
    option_strike?: number | null
    option_right?: 'C' | 'P' | null
    option_expiry?: string | null
  }
  size?: 'small' | 'medium'
}

export default function OptionTypeChip({ ticker, action, size = 'small' }: OptionTypeChipProps) {
  // Decide whether to render and which tag (Call / Put / Futures) to show.
  let tag: 'Call' | 'Put' | null = null
  let isFutures = false
  let descriptor = ''

  if (action) {
    if (isOptionInstrument(action.instrument_type)) {
      isFutures = action.instrument_type === 'futures_option'
      tag = action.option_right === 'C' ? 'Call' : action.option_right === 'P' ? 'Put' : null
      descriptor = describeOptionFromAction(action)
      // Fall back to ticker tag if right wasn't populated but the
      // description came from a parsed legacy ticker.
      if (!tag && action.ticker) {
        const t = getOptionDisplayTag(action.ticker)
        if (t === 'Call' || t === 'Put') tag = t
      }
    } else if (action.ticker) {
      // instrument_type wasn't set (or is 'stock') but the ticker
      // looks like an option — treat as legacy.
      const t = getOptionDisplayTag(action.ticker)
      if (t === 'Call' || t === 'Put') {
        tag = t
        descriptor = describeOptionFromAction(action)
      }
    }
  } else if (ticker) {
    const t = getOptionDisplayTag(ticker)
    if (t === 'Call' || t === 'Put') {
      tag = t
      descriptor = describeOptionFromAction({ ticker })
    }
  }

  if (!tag) return null

  // Composed label: "Call · $18 · 21 Jan '28" or "Put · $200" etc.
  // Falls back to just the tag when no descriptor is available.
  const futuresPrefix = isFutures ? 'Fut ' : ''
  const label = descriptor ? `${futuresPrefix}${descriptor}` : `${futuresPrefix}${tag}`
  return (
    <Chip
      size={size}
      label={label}
      variant="outlined"
      sx={{
        borderColor: tag === 'Call' ? 'info.main' : 'warning.main',
        color: tag === 'Call' ? 'info.dark' : 'warning.dark',
        fontWeight: 600,
        fontFamily: descriptor ? "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace" : undefined,
        fontSize: descriptor ? '0.7rem' : undefined,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  )
}
