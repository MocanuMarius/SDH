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
  return (
    <Chip
      size={size}
      label={displayLabel}
      variant={variant}
      sx={{
        ...(isFilled
          ? {
              bgcolor: color,
              color: '#fff',
              border: 'none',
              '&:hover': { bgcolor: color, filter: 'brightness(1.08)' },
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
