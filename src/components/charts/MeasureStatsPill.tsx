/**
 * Floating stats pill shown over a chart while the user is dragging to
 * measure (live) or after they've committed a measure-selection.
 * Identical layout was duplicated in TimelinePage + TickerTimelineChart;
 * one place now.
 *
 * Parent positions it (absolute left/top), this component just renders
 * the Paper card with the standard date-range / pct-change / drawdown
 * payload.
 */

import { Box, Paper, Typography } from '@mui/material'
import type { RangeStats } from '../../utils/chartRangeStats'

export interface MeasureStatsPillProps {
  stats: RangeStats
  /** Pixel position relative to the chart wrapper, parent computes. */
  left: number
  /** Top offset; defaults to 10 px which sits below the chart's top
   *  margin without overlapping the price line in most layouts. */
  top?: number
}

export default function MeasureStatsPill({ stats, left, top = 10 }: MeasureStatsPillProps) {
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
        elevation={3}
        sx={{
          p: 1.25,
          minWidth: 168,
          borderRadius: 1.5,
          boxShadow: 3,
          whiteSpace: 'nowrap',
        }}
      >
        <Typography variant="caption" color="text.secondary" display="block">
          {new Date(stats.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          {' – '}
          {new Date(stats.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
        </Typography>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ color: stats.pctChange >= 0 ? 'success.main' : 'error.main', fontSize: '1rem' }}
        >
          {stats.pctChange >= 0 ? '+' : ''}{stats.pctChange.toFixed(2)}%
          {stats.cagr != null && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem', ml: 0.5 }}>
              ({stats.cagr >= 0 ? '+' : ''}{stats.cagr.toFixed(1)}%/yr)
            </Box>
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Price: {stats.endPrice >= stats.startPrice ? '+' : ''}{(stats.endPrice - stats.startPrice).toFixed(2)}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Drawdown: -{stats.drawdownPct.toFixed(1)}%
        </Typography>
      </Paper>
    </Box>
  )
}
