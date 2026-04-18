/**
 * Small floating pill shown next to the crosshair line while the user
 * hovers over a chart with the mouse. Desktop-only affordance — touch
 * devices use tap-to-select on decision markers.
 *
 * The parent owns the geometry (plotLeft/plotWidth, chartData) and
 * passes us the already-resolved date + price for the hovered X. This
 * file just paints the pill. Keeps the shape symmetric with the other
 * chart-overlay components (`MeasureStatsPill`, `RangeSelectorButtons`).
 */

import { Box, Paper, Typography } from '@mui/material'

export interface HoverPricePillProps {
  /** Pixel position of the crosshair relative to the chart wrapper. */
  left: number
  /** Resolved ISO date string for the hovered chart point. */
  date: string
  /** Resolved price for the hovered chart point. */
  price: number
  /** Top offset; default 8 px keeps the pill close to the chart top. */
  top?: number
  /** Optional currency suffix (e.g. "USD"); hidden when undefined. */
  currency?: string | null
}

export default function HoverPricePill({ left, date, price, top = 8, currency }: HoverPricePillProps) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top,
        left,
        transform: 'translateX(-50%)',
        zIndex: 11,
        pointerEvents: 'none',
      }}
    >
      <Paper
        elevation={2}
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          whiteSpace: 'nowrap',
          bgcolor: 'background.paper',
          boxShadow: 2,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
          {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          {' · '}
          <Box component="span" sx={{ fontWeight: 700 }}>
            ${price.toFixed(2)}{currency ? ` ${currency}` : ''}
          </Box>
        </Typography>
      </Paper>
    </Box>
  )
}
