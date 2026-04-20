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
import { motion } from 'motion/react'
import { prefersReducedMotion } from '../../utils/motion'

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
  const reduced = prefersReducedMotion()
  return (
    <Paper
      variant="outlined"
      sx={{
        p: dense ? 2.5 : 4,
        textAlign: 'center',
        bgcolor: 'background.paper',
      }}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {icon ? (
          <Box
            sx={{
              mb: 1.5,
              mx: 'auto',
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              color: 'primary.main',
              bgcolor: 'primary.50',
              border: '1px solid',
              borderColor: 'primary.200',
              '& svg': { fontSize: 28 },
            }}
          >
            {icon}
          </Box>
        ) : (
          // Dingbat ornament — the typographic convention for a section
          // break in print newspapers. Subtler than a made-up icon and
          // reads as intentional "nothing here yet" punctuation.
          <Box
            aria-hidden
            sx={{
              mb: 1.25,
              color: 'text.disabled',
              letterSpacing: '0.8em',
              fontSize: '0.8rem',
              fontWeight: 600,
              // Dingbat glyph: three centered dots with wide tracking.
              // Keeps the gesture in the Latin-text flow; no icon font needed.
              userSelect: 'none',
            }}
          >
            · · ·
          </Box>
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
      </motion.div>
    </Paper>
  )
}
