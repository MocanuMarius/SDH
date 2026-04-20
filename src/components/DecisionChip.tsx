/**
 * Chip for decision/action type with consistent color and label from theme.
 * Use everywhere we display type (cards, tables, filters, timeline).
 */

import { Chip, ChipProps } from '@mui/material'
import { getDecisionTypeConfig } from '../theme/decisionTypes'

export interface DecisionChipProps extends Omit<ChipProps, 'color' | 'label'> {
  type: string | null | undefined
  /** Override display label */
  label?: string
  size?: 'small' | 'medium'
  variant?: 'filled' | 'outlined'
}

export default function DecisionChip({
  type,
  label: labelOverride,
  size = 'small',
  variant = 'filled',
  sx,
  ...rest
}: DecisionChipProps) {
  const { label, color } = getDecisionTypeConfig(type)
  const displayLabel = labelOverride ?? label

  const isFilled = variant === 'filled'
  // Small tonal glow per type — buys get a green halo, sells red,
  // other (pass/research/hold/watchlist/speculate) a muted slate. The
  // effect is intentionally small (3px blur, low opacity) so it
  // doesn't shout in a dense list like the Actions feed, but chips
  // scan-apart from plain gray text when your eye sweeps a page.
  // Only applied to the `filled` variant — outlined chips sit in
  // dense tables where extra halos would visually crowd.
  const glow = isFilled ? `0 0 0 0 ${color}00, 0 2px 6px ${color}33` : undefined
  const glowHover = isFilled ? `0 0 0 1px ${color}40, 0 3px 10px ${color}52` : undefined
  return (
    <Chip
      size={size}
      label={displayLabel}
      variant={variant}
      sx={{
        transition: 'box-shadow 160ms ease, background-color 160ms ease, filter 160ms ease',
        ...(isFilled
          ? {
              bgcolor: color,
              color: '#fff',
              border: 'none',
              boxShadow: glow,
              '&:hover': { bgcolor: color, filter: 'brightness(1.08)', boxShadow: glowHover },
              '& .MuiChip-label': { fontWeight: 600 },
            }
          : {
              borderColor: color,
              color,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: `${color}14`, borderColor: color },
              '& .MuiChip-label': { fontWeight: 600 },
            }),
        ...sx,
      }}
      {...rest}
    />
  )
}
