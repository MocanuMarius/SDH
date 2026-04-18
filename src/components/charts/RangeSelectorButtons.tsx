/**
 * Range-preset toggle buttons (1M / 3M / 6M / YTD / 1Y / …) used by both
 * the timeline page and the per-ticker chart card. Identical visuals
 * across both, so it lived as duplicated JSX in two places — extracted
 * here so any tweak (sizing, label set, theming) propagates to both.
 *
 * Behaviour-only — no internal state. Parent owns `value`, `onChange`,
 * and the optional `disabled` flag (used when a zoom is active so no
 * preset reads as "current").
 */

import { Box, Button, Tabs, Tab } from '@mui/material'
import type { ChartRange } from '../../services/chartApiService'

export const TIMELINE_RANGES: { value: ChartRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'MAX' },
]

export interface RangeSelectorButtonsProps {
  value: ChartRange
  onChange: (next: ChartRange) => void
  /** When true, no preset shows as active (e.g. a custom zoom is in
   *  effect so neither 1Y nor 2Y nor anything else perfectly fits). */
  noActive?: boolean
  /** "buttons" — flat text-button row used by TimelinePage.
   *  "tabs"    — outlined tab chips used by TickerTimelineChart. */
  variant?: 'buttons' | 'tabs'
}

export default function RangeSelectorButtons({
  value,
  onChange,
  noActive = false,
  variant = 'buttons',
}: RangeSelectorButtonsProps) {
  if (variant === 'tabs') {
    return (
      <Tabs
        value={value}
        onChange={(_e, v) => onChange(v as ChartRange)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          minHeight: 32,
          '& .MuiTabs-flexContainer': { gap: 0.25, justifyContent: 'flex-start', flexWrap: 'wrap' },
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTab-root': {
            minHeight: 28,
            minWidth: 36,
            py: 0.25,
            px: 1,
            fontSize: '0.78rem',
            fontWeight: 600,
            textTransform: 'none',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            color: 'text.secondary',
            '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' },
            '&:hover': { bgcolor: 'action.hover' },
            '&.Mui-selected:hover': { bgcolor: 'primary.dark' },
          },
        }}
      >
        {TIMELINE_RANGES.map((r) => (
          <Tab key={r.value} value={r.value} label={r.label} />
        ))}
      </Tabs>
    )
  }

  // Default: text-button row used by TimelinePage. Compact, primary-blue
  // when active.
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
      {TIMELINE_RANGES.map((r) => {
        const isActive = !noActive && value === r.value
        return (
          <Button
            key={r.value}
            size="small"
            disableElevation
            variant={isActive ? 'contained' : 'text'}
            color="primary"
            onClick={() => onChange(r.value)}
            sx={{
              minWidth: 28,
              minHeight: 28,
              px: 0.5,
              py: 0.15,
              fontSize: '0.7rem',
              fontWeight: isActive ? 700 : 500,
              borderRadius: 1,
              color: isActive ? undefined : 'text.secondary',
            }}
          >
            {r.label}
          </Button>
        )
      })}
    </Box>
  )
}
