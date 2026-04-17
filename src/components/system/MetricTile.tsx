/**
 * MetricTile — single number + label, used on dashboards (Analytics, Long-term
 * horizons summary, etc.). Restrained newspaper style: serif numeral, small
 * caps label, hairline frame, no shadow.
 *
 * Visual model:
 *
 *   LABEL                                ← small caps, secondary text
 *   42                                   ← serif numeral, primary ink
 *   +12% since last month                ← optional delta, success/error
 */

import { Paper, Typography } from '@mui/material'
import { fontDisplay } from '../../theme'
import type { ReactNode } from 'react'

export interface MetricTileProps {
  label: ReactNode
  /** Primary value — number or short string. */
  value: ReactNode
  /** Optional helper line below the value (delta, denominator, "no data"). */
  hint?: ReactNode
  /** Tone for the value — 'positive' | 'negative' tints the number; default is ink. */
  tone?: 'default' | 'positive' | 'negative' | 'muted'
  /** Highlight the tile (e.g. for the currently-relevant metric). */
  highlighted?: boolean
}

const TONE_COLOR: Record<NonNullable<MetricTileProps['tone']>, string> = {
  default: 'text.primary',
  positive: 'success.main',
  negative: 'error.main',
  muted: 'text.secondary',
}

export default function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  highlighted = false,
}: MetricTileProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        flex: '1 1 140px',
        minWidth: 140,
        bgcolor: highlighted ? 'primary.50' : 'background.paper',
        borderColor: highlighted ? 'primary.light' : 'divider',
      }}
    >
      <Typography
        variant="overline"
        sx={{ display: 'block', mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        sx={{
          fontFamily: fontDisplay,
          fontWeight: 700,
          fontSize: { xs: '1.6rem', sm: '1.875rem' },
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: TONE_COLOR[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {hint && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}
        >
          {hint}
        </Typography>
      )}
    </Paper>
  )
}
