/**
 * StatusChip — single source of truth for "what state is this thing in?" labels.
 *
 * Centralises the colour mapping for ticker / decision states so the same
 * status shows the same chip everywhere (Ticker page header, list rows,
 * insights tables, etc.).
 *
 * Use this instead of inlining `<Chip color="success">Holding</Chip>` per page.
 */

import { Chip, type ChipProps } from '@mui/material'

export type StatusKind =
  | 'holding'
  | 'sold-reduced'
  | 'passed'
  | 'watching'
  | 'researching'
  | 'speculating'
  | 'open'
  | 'closed'
  | 'overdue'
  | 'upcoming'
  | 'resolved'
  | 'neutral'

interface StatusConfig {
  label: string
  color: ChipProps['color']
  variant: 'filled' | 'outlined'
}

const CONFIG: Record<StatusKind, StatusConfig> = {
  holding:       { label: 'Holding',       color: 'success', variant: 'filled' },
  'sold-reduced':{ label: 'Sold / reduced',color: 'error',   variant: 'filled' },
  passed:        { label: 'Passed',        color: undefined, variant: 'outlined' },
  watching:      { label: 'Watching',      color: 'warning', variant: 'filled' },
  researching:   { label: 'Researching',   color: 'warning', variant: 'filled' },
  speculating:   { label: 'Speculating',   color: 'warning', variant: 'filled' },
  open:          { label: 'Open',          color: 'success', variant: 'outlined' },
  closed:        { label: 'Closed',        color: undefined, variant: 'outlined' },
  overdue:       { label: 'Overdue',       color: 'error',   variant: 'filled' },
  upcoming:      { label: 'Upcoming',      color: 'warning', variant: 'outlined' },
  resolved:      { label: 'Resolved',      color: 'success', variant: 'outlined' },
  neutral:       { label: '—',             color: undefined, variant: 'outlined' },
}

export interface StatusChipProps {
  kind: StatusKind
  /** Override the default label for the chosen kind (rare — usually leave alone). */
  label?: string
  /** Default 'small' for inline use. */
  size?: 'small' | 'medium'
}

export default function StatusChip({ kind, label, size = 'small' }: StatusChipProps) {
  const cfg = CONFIG[kind] ?? CONFIG.neutral
  return (
    <Chip
      size={size}
      label={label ?? cfg.label}
      color={cfg.color}
      variant={cfg.variant}
      sx={{ fontWeight: 600 }}
    />
  )
}

/** Map a decision type (latest action) → ticker status. Used by Ticker page header. */
export function statusFromLatestActionType(type: string | null | undefined): StatusKind {
  switch (type) {
    case 'buy':
    case 'add_more':
    case 'cover':
      return 'holding'
    case 'sell':
    case 'trim':
    case 'short':
      return 'sold-reduced'
    case 'pass':
      return 'passed'
    case 'hold':
    case 'watchlist':
      return 'watching'
    case 'research':
      return 'researching'
    case 'speculate':
      return 'speculating'
    default:
      return 'neutral'
  }
}
