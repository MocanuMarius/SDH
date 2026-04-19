/**
 * InlineDecisionBar — newspaper-tape style log-a-decision strip.
 *
 * Lives at the top of the Ticker page. The user's mental model is "I'm
 * looking at $UBER and want to log a decision NOW", so the form is right
 * there in context, not behind a modal.
 *
 *   [ Buy ▾ ]  $UBER  $77.12  [ size ▾ ]   reason …          [ Log ]
 *                                                              [ + details ]
 *
 * - Type select (Buy / Sell / Pass / Trim / Add more / Research / Hold /
 *   Watchlist / Speculate / Cover / Short — same set as the dialog).
 * - Ticker is pinned (passed in from the page route).
 * - Current price shown read-only as a hint.
 * - Size select (defaults to medium — most decisions are medium).
 * - Reason text field — optional, single line, room for the elevator pitch.
 * - Log button: writes a structured `actions` row directly via the parent's
 *   onLog handler (no modal, no extra confirmation).
 * - "+ details" button: escape hatch to open the full ActionFormDialog when
 *   the user wants to set price/date/notes/kill criteria/pre-mortem.
 *
 * Implements the "Progressive disclosure with `+ Add X`" + "Default to the
 * common case" principles from docs/PRINCIPLES.md.
 */

import { useState } from 'react'
import {
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import { ACTION_TYPES, ACTION_SIZES, type ActionSize } from '../types/database'
import type { Action } from '../types/database'
import DecisionChip from './DecisionChip'

export interface InlineDecisionBarProps {
  ticker: string
  /** Used as default `company_name` when logging — stops the parent having
   *  to thread it through the dialog if it happens to know it. */
  companyName?: string
  /** Latest known price for this ticker. Shown as a hint and used as the
   *  default `price` value when logging. Pass null if unknown. */
  currentPrice?: number | null
  /** Currency string from the price provider, e.g. 'USD'. Defaults to ''. */
  currency?: string
  /** Fired when the user clicks Log. Parent persists via createAction. */
  onLog: (input: {
    type: Action['type']
    reason: string
    size: ActionSize
    price: string
    currency: string
  }) => Promise<void>
  /** Fired when the user wants the full form (date / notes / kill criteria). */
  onWantDetails: () => void
}

export default function InlineDecisionBar({
  // ticker is still received from the parent (consumers pass it from
  // the route), but the bar no longer displays it — the page header
  // immediately above already shows the ticker prominently.
  ticker: _ticker,
  companyName: _companyName,
  currentPrice,
  currency = '',
  onLog,
  onWantDetails,
}: InlineDecisionBarProps) {
  // Default to 'buy' — most logs from a Ticker page are buys/adjustments
  // since the user is looking at a ticker they already care about.
  const [type, setType] = useState<Action['type']>('buy')
  const [size, setSize] = useState<ActionSize>('medium')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const priceStr = currentPrice != null ? currentPrice.toFixed(2) : ''

  async function handleLog() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onLog({
        type,
        reason: reason.trim(),
        size,
        price: priceStr,
        currency,
      })
      // Reset only the reason; type/size are sticky so the user can log
      // a streak of similar actions without re-selecting.
      setReason('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleTypeChange(e: SelectChangeEvent<unknown>) {
    setType(e.target.value as Action['type'])
  }
  function handleSizeChange(e: SelectChangeEvent<unknown>) {
    setSize(e.target.value as ActionSize)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        flexWrap: 'wrap',
        p: 1,
        mb: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      {/* Type — keep narrow; chip preview lives next to the select for visual
          continuity with how decisions render elsewhere. */}
      <FormControl size="small" sx={{ minWidth: 110 }}>
        <Select
          value={type}
          onChange={handleTypeChange}
          renderValue={(v) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DecisionChip type={v as Action['type']} size="small" sx={{ pointerEvents: 'none' }} />
            </Box>
          )}
        >
          {ACTION_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              <DecisionChip type={t} size="small" sx={{ pointerEvents: 'none', mr: 1 }} />
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Current price hint — the ticker symbol used to live here too,
          but the page header right above this bar already shows the
          ticker in a big sticky title, so the second copy was just
          visual noise. Just the price stays as a useful inline cue. */}
      {priceStr && (
        <Typography
          component="span"
          variant="caption"
          sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace', mx: 0.5 }}
        >
          {priceStr}
        </Typography>
      )}

      {/* Size */}
      <FormControl size="small" sx={{ minWidth: 90 }}>
        <Select value={size} onChange={handleSizeChange}>
          {ACTION_SIZES.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Reason — flex-grows to take remaining horizontal space, but wraps
          to a full-width row on narrow screens. */}
      <TextField
        size="small"
        placeholder="reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleLog()
          }
        }}
        sx={{ flex: '1 1 200px', minWidth: 140 }}
      />

      {/* Primary CTA */}
      <Button
        variant="contained"
        size="small"
        onClick={handleLog}
        disabled={submitting}
        sx={{ textTransform: 'none', fontWeight: 700, minWidth: 64 }}
      >
        Log
      </Button>

      {/* Escape hatch to the full form (date, notes, kill criteria, etc.). */}
      <IconButton
        size="small"
        onClick={onWantDetails}
        title="More fields (date, notes, kill criteria, pre-mortem)"
        sx={{ color: 'text.secondary' }}
      >
        <TuneIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
