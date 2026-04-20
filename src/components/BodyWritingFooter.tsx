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

/** Depth-of-writing milestones. Each feels like a quiet pat on the
 *  back — a draft worth calling a "note" becomes a "piece" becomes a
 *  "deep dive" as the word count crosses the thresholds. */
const MILESTONES: { at: number; label: string }[] = [
  { at: 0,    label: 'Scrap' },
  { at: 100,  label: 'Note' },
  { at: 300,  label: 'Piece' },
  { at: 800,  label: 'Deep dive' },
  { at: 1800, label: 'Opus' },
]

function currentMilestone(words: number): { current: typeof MILESTONES[number]; next: typeof MILESTONES[number] | null; progress: number } {
  let currentIdx = 0
  for (let i = 0; i < MILESTONES.length; i++) {
    if (words >= MILESTONES[i].at) currentIdx = i
  }
  const current = MILESTONES[currentIdx]
  const next = MILESTONES[currentIdx + 1] ?? null
  const progress = next
    ? Math.min(1, (words - current.at) / (next.at - current.at))
    : 1
  return { current, next, progress }
}

export default function BodyWritingFooter({ text }: BodyWritingFooterProps) {
  const words = useMemo(() => countWords(text ?? ''), [text])
  if (words === 0) return null
  const readMin = Math.max(1, Math.round(words / 220))
  const { current, next, progress } = currentMilestone(words)
  return (
    <Box aria-hidden>
      {/* Ambient progress rule — thin primary-tinted line fills from
          the current milestone toward the next. Silent achievement
          recognition; doesn't call attention to itself. Hides at
          "Opus" since there's no further milestone. */}
      {next && (
        <Box
          sx={{
            height: 2,
            bgcolor: 'divider',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progress * 100}%`,
              bgcolor: 'primary.main',
              opacity: 0.42,
              transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
      )}
      <Box
        sx={{
          borderTop: next ? 'none' : '1px dashed',
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
          {current.label}
          {next && (
            <Box component="span" sx={{ ml: 0.5, fontSize: '0.7rem' }}>
              · {next.at - words} words to {next.label}
            </Box>
          )}
          {!next && ` · ${readMin === 1 ? '~1 min read' : `~${readMin} min read`}`}
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
    </Box>
  )
}
