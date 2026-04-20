/**
 * BodyWritingFooter — a quiet "you're writing" kicker that shows
 * live word count and estimated reading time below the entry-body
 * editor. Evokes a copy desk's running word-count tape more than a
 * hard performance metric — the numbers aren't precious, the
 * feedback is.
 *
 * Stays hidden when the textarea is empty so the first-typing
 * moment isn't cluttered. Hairline divider above keeps it tonally
 * part of the editor surface, not a detached stat block.
 *
 * Reading time = Math.max(1, round(words / 220)). 220 WPM is a
 * common silent-reading estimate for a literate adult on prose of
 * medium density.
 */

import { useMemo } from 'react'
import { Box, Typography } from '@mui/material'

export interface BodyWritingFooterProps {
  text: string | null | undefined
}

function countWords(s: string): number {
  if (!s) return 0
  // Strip URLs and $TICKER markers so they don't inflate the count
  // — they're structurally meaningful but don't represent "prose".
  const cleaned = s
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\$[A-Za-z0-9.:]+/g, '')
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean)
  return tokens.length
}

export default function BodyWritingFooter({ text }: BodyWritingFooterProps) {
  const words = useMemo(() => countWords(text ?? ''), [text])
  if (words === 0) return null
  const readMin = Math.max(1, Math.round(words / 220))
  return (
    <Box
      aria-hidden
      sx={{
        borderTop: '1px dashed',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        px: { xs: 2, sm: 4 },
        py: 1,
        color: 'text.secondary',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
          fontStyle: 'italic',
          fontSize: '0.78rem',
          letterSpacing: '0.01em',
          color: 'text.disabled',
        }}
      >
        {readMin === 1 ? '~1 min read' : `~${readMin} min read`}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: '0.72rem',
          color: 'text.disabled',
          letterSpacing: '0.04em',
        }}
      >
        {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
      </Typography>
    </Box>
  )
}
