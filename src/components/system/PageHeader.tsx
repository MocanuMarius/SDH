/**
 * PageHeader — the canonical top-of-page element used by every full page.
 *
 * Visual model: newspaper article opener.
 *
 *   [eyebrow]            ← optional small caps kicker (e.g. "Trades / $E3G1")
 *   Big serif headline   ← title
 *   italic deck          ← optional dek (subtitle / explainer)
 *                                           [actions on the right]
 *
 * Use this instead of inlining `<Typography variant="h1" sx={...}>` per page.
 * That's how we keep the type scale, spacing, and color tokens consistent.
 */

import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Big serif page title. */
  title: ReactNode
  /** Italic one-liner explaining what this page is for. */
  dek?: ReactNode
  /** Optional small-caps kicker shown above the title (e.g. breadcrumb-style). */
  eyebrow?: ReactNode
  /** Right-aligned action slot — buttons, switches, etc. */
  actions?: ReactNode
  /** Reduce vertical breathing room (used on dense screens like the Tickers list). */
  dense?: boolean
}

export default function PageHeader({ title, dek, eyebrow, actions, dense = false }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: { xs: 1, sm: 2 },
        mt: 0.5,
        mb: dense ? 1.5 : 2.5,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <Typography
            variant="overline"
            sx={{ display: 'block', mb: 0.25, color: 'text.secondary' }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography
          variant="h1"
          sx={{
            // h1 is defined in theme.ts (Source Serif 4, clamp size).
            // We just override margins here so the dek hugs the title.
            mb: dek ? 0.5 : 0,
            mt: 0,
            wordBreak: 'break-word',
          }}
        >
          {title}
        </Typography>
        {dek && (
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontStyle: 'italic', maxWidth: 720 }}
          >
            {dek}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
