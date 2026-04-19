/**
 * Range-preset selector for chart pages. One value, one onChange, three
 * presentation variants:
 *   - "dropdown" (default) — compact MUI Select showing the current
 *     label (e.g. "6M"). Used by both TimelinePage and the per-ticker
 *     chart card so the controls row stays tight: dropdown + Reset +
 *     gear all fit on one line. The previous always-visible row of nine
 *     toggle buttons crowded the chart's chrome at small widths and
 *     made the gear/Reset wrap onto a second line.
 *   - "buttons" — legacy flat text-button row. Kept for any caller that
 *     still wants the always-visible presets; nothing in the app uses
 *     it after the dropdown migration but the variant stays as a
 *     non-breaking option.
 *   - "tabs" — outlined chip-tabs row. Same story as "buttons".
 *
 * Behaviour-only — no internal state. Parent owns `value`, `onChange`,
 * and the optional `noActive` flag (used when a zoom is active so no
 * preset reads as "current").
 */

import { Box, Button, FormControl, MenuItem, Select, Tabs, Tab } from '@mui/material'
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
  /** "dropdown" — compact MUI Select (DEFAULT, used everywhere).
   *  "buttons"  — legacy flat text-button row.
   *  "tabs"     — legacy outlined tab chips. */
  variant?: 'dropdown' | 'buttons' | 'tabs'
}

export default function RangeSelectorButtons({
  value,
  onChange,
  noActive = false,
  variant = 'dropdown',
}: RangeSelectorButtonsProps) {
  if (variant === 'dropdown') {
    // Render a "Custom" entry only when the parent indicates we're in a
    // zoom that doesn't match any preset, so the Select has something to
    // show without the user wondering why nothing is selected.
    return (
      <FormControl size="small" variant="outlined" sx={{ minWidth: 88 }}>
        <Select
          value={noActive ? '__zoom__' : value}
          onChange={(e) => {
            const v = e.target.value as string
            if (v !== '__zoom__') onChange(v as ChartRange)
          }}
          sx={{
            // Compact preset selector — height matches the gear IconButton
            // (~32 px) so the whole controls row aligns nicely.
            height: 32,
            fontSize: '0.78rem',
            fontWeight: 600,
            '& .MuiSelect-select': { py: 0.5, pr: '24px !important', pl: 1.25 },
          }}
        >
          {noActive && (
            <MenuItem value="__zoom__" disabled sx={{ fontSize: '0.78rem' }}>
              Custom zoom
            </MenuItem>
          )}
          {TIMELINE_RANGES.map((r) => (
            <MenuItem key={r.value} value={r.value} sx={{ fontSize: '0.78rem' }}>
              {r.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
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
