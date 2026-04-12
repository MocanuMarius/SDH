/**
 * Small chip showing Call (C) or Put (P) for option tickers.
 * Renders nothing when ticker is not an option. Use next to ticker label for clarity.
 */

import { Chip } from '@mui/material'
import { getOptionDisplayTag } from '../utils/tickerCompany'

interface OptionTypeChipProps {
  ticker: string | null | undefined
  size?: 'small' | 'medium'
}

export default function OptionTypeChip({ ticker, size = 'small' }: OptionTypeChipProps) {
  const tag = getOptionDisplayTag(ticker)
  if (tag !== 'Call' && tag !== 'Put') return null
  return (
    <Chip
      size={size}
      label={tag}
      variant="outlined"
      sx={{
        borderColor: tag === 'Call' ? 'info.main' : 'warning.main',
        color: tag === 'Call' ? 'info.dark' : 'warning.dark',
        fontWeight: 600,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  )
}
