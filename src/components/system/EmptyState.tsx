/**
 * EmptyState — what we show when a list/page has no rows yet.
 *
 * Replaces the ad-hoc `<Alert severity="info">` and bare `<Paper>X</Paper>`
 * patterns scattered across pages. Calm, newspaper-y, with a single clear
 * "what to do next" CTA.
 *
 * Visual model:
 *
 *   ┌──────────── outlined paper, centered text ────────────┐
 *   │                  [optional icon]                       │
 *   │                  Big title                             │
 *   │                  italic explainer                      │
 *   │                       [CTA]                            │
 *   └─────────────────────────────────────────────────────────┘
 */

import { Box, Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  /** Short headline like "No tickers yet" or "No long-term horizons". */
  title: ReactNode
  /** One-or-two-sentence explanation of what gets here and why it's empty. */
  description?: ReactNode
  /** Primary call-to-action — usually a button or link to fix the empty state. */
  action?: ReactNode
  /** Optional icon shown above the title. */
  icon?: ReactNode
  /** Reduce padding (used inside cards). */
  dense?: boolean
}

export default function EmptyState({ title, description, action, icon, dense = false }: EmptyStateProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: dense ? 2.5 : 4,
        textAlign: 'center',
        bgcolor: 'background.paper',
      }}
    >
      {icon && (
        <Box sx={{ mb: 1.5, color: 'text.secondary', '& svg': { fontSize: 36 } }}>{icon}</Box>
      )}
      <Typography variant="subtitle1" sx={{ mb: description ? 0.75 : 0, fontWeight: 700 }}>
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            fontStyle: 'italic',
            maxWidth: 460,
            mx: 'auto',
            mb: action ? 2 : 0,
          }}
        >
          {description}
        </Typography>
      )}
      {action && <Box>{action}</Box>}
    </Paper>
  )
}
