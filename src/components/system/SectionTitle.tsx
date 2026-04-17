/**
 * SectionTitle — small newspaper-style section label, used inside pages and
 * cards to mark a sub-area ("Tags", "Decisions on this entry", "Pending
 * decisions", etc.). Pairs with the global `overline` variant from theme.ts.
 *
 * Visual model:
 *   TAGS · 3        ← uppercase, letter-spaced, optional count
 *   ──────          ← optional thin rule
 *
 * Use this instead of writing `<Typography variant="overline">` everywhere.
 */

import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export interface SectionTitleProps {
  children: ReactNode
  /** Optional small count badge after the title (e.g. number of decisions). */
  count?: number
  /** Right-aligned slot — usually a small action link. */
  action?: ReactNode
  /** Add a thin rule under the title for stronger separation. */
  rule?: boolean
  /** Vertical gap below the title. Default: 1. */
  mb?: number | { xs?: number; sm?: number }
}

export default function SectionTitle({ children, count, action, rule = false, mb = 1 }: SectionTitleProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 1,
        mb,
        ...(rule && {
          pb: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
        }),
      }}
    >
      <Typography variant="overline" sx={{ flex: action ? 0 : 1 }}>
        {children}
        {count != null && (
          <Box component="span" sx={{ color: 'text.secondary', ml: 0.75, fontWeight: 600 }}>
            ({count})
          </Box>
        )}
      </Typography>
      {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
    </Box>
  )
}
