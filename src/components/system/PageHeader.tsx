/**
 * PageHeader — the canonical top-of-page element used by every full page.
 *
 * Visual model: newspaper article opener.
 *
 *   [eyebrow]            ← optional small caps kicker (e.g. "Trades / $E3G1")
 *   Big serif headline   ← title (centered + sticky on mobile, left-aligned on desktop)
 *                                           [actions on the right]
 *
 * Mobile behaviour:
 *   The title row becomes `position: sticky` just under the fixed AppBar
 *   (top: 56px) and is centered. Gives the user a constant "you are here"
 *   anchor as they scroll.
 *
 * The `dek` prop has been retired — descriptive helper paragraphs were
 * tutorial noise; we let the page content speak for itself.
 */

import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Big serif page title. */
  title: ReactNode
  /** Optional small-caps kicker shown above the title (e.g. breadcrumb-style). */
  eyebrow?: ReactNode
  /** Right-aligned action slot — buttons, switches, etc. */
  actions?: ReactNode
  /** Reduce vertical breathing room (used on dense screens like the Tickers list). */
  dense?: boolean
}

export default function PageHeader({ title, eyebrow, actions, dense = false }: PageHeaderProps) {
  return (
    <Box
      sx={{
        // Stick the entire header strip just under the fixed AppBar so the
        // user always knows what page they're on, even mid-scroll. Backed by
        // the paper bg so chart/list content doesn't bleed through.
        position: { xs: 'sticky', sm: 'static' },
        top: { xs: 56, sm: 0 },
        zIndex: { xs: 5, sm: 'auto' },
        bgcolor: { xs: 'background.default', sm: 'transparent' },
        // On mobile, a hairline below the sticky strip separates it from
        // the scrolling content beneath.
        borderBottom: { xs: '1px solid', sm: 'none' },
        borderColor: { xs: 'divider', sm: 'transparent' },
        mx: { xs: -1.5, sm: 0 },   // bleed to viewport edges so the bg covers
        px: { xs: 1.5, sm: 0 },
        pt: { xs: 0.5, sm: 0.5 },
        pb: { xs: 0.5, sm: 0 },
        mb: dense ? 1.5 : 2.5,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'center', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: { xs: 0.5, sm: 2 },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
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
            mb: 0,
            mt: 0,
            wordBreak: 'break-word',
            // text-wrap: balance evens out the line lengths in multi-
            // line titles so we don't end up with a single orphaned
            // word on a line. Browser-native, free to add — browsers
            // that don't support it just fall back to normal wrapping.
            textWrap: 'balance',
            // Mobile: tighter title that doesn't dominate the sticky strip.
            fontSize: { xs: '1.4rem', sm: undefined },
            lineHeight: { xs: 1.15, sm: undefined },
          }}
        >
          {title}
        </Typography>
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
