/**
 * ContinuedFooter — a small italic "continued below" kicker that
 * sits at the bottom of a long body, calling out that there's more
 * structured content further down the page (decisions, predictions,
 * reminders, valuation tabs). The print-newspaper equivalent of
 * "(continued on page 4)" — acknowledges the article doesn't end
 * where the prose does.
 *
 * Only renders when the source text is long enough that the cue adds
 * useful orientation — short notes don't need it.
 */

import { Box, Typography } from '@mui/material'

export interface ContinuedFooterProps {
  /** If the source text is shorter than this (chars), render nothing. */
  minLength?: number
  source: string
}

export default function ContinuedFooter({ source, minLength = 280 }: ContinuedFooterProps) {
  if (!source || source.length < minLength) return null
  return (
    <Box
      aria-hidden
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mt: 1.5,
        pt: 1,
        color: 'text.disabled',
        borderTop: '1px dashed',
        borderColor: 'divider',
        justifyContent: 'flex-end',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontStyle: 'italic',
          letterSpacing: '0.02em',
          color: 'text.secondary',
          fontSize: '0.72rem',
        }}
      >
        continued below
      </Typography>
      <Box component="span" aria-hidden sx={{ fontSize: '0.9em', transform: 'translateY(-1px)' }}>
        →
      </Box>
    </Box>
  )
}
