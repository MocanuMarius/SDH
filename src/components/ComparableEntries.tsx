/**
 * ComparableEntries — a quiet "also writing about" card that shows
 * up to 3 recent entries that share a ticker or tag with the draft
 * currently being composed. Meant to nudge the writer toward
 * connecting past thinking with the current idea, not as a
 * recommendation engine.
 *
 * Renders only when the current draft has at least one $TICKER or
 * tag to match on, and only when results exist. Desktop-ish layout
 * — stacks under the form on mobile, making it easy to skim; just
 * hidden in focus mode so it doesn't compete for attention.
 */

import { useMemo } from 'react'
import { Box, Typography, Link as MuiLink } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useEntriesWithActions } from '../hooks/queries'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import RelativeDate from './RelativeDate'

export interface ComparableEntriesProps {
  /** Current draft body + title combined — we scrape this for tickers. */
  draftText: string
  /** Current tags (array of strings from the form). */
  draftTags: string[]
  /** Hide entirely when the user is in focus mode. */
  hidden?: boolean
  /** Exclude this entry from the list (on the edit flow). */
  excludeEntryId?: string
}

function extractTickers(text: string): Set<string> {
  const out = new Set<string>()
  const re = /\$([A-Z][A-Z0-9.:]{0,9})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].toUpperCase())
  }
  return out
}

export default function ComparableEntries({ draftText, draftTags, hidden, excludeEntryId }: ComparableEntriesProps) {
  const entriesQ = useEntriesWithActions({ limit: 60 })
  const draftTickers = useMemo(() => extractTickers(draftText), [draftText])
  const draftTagSet = useMemo(() => new Set(draftTags.map((t) => t.toLowerCase())), [draftTags])

  const matches = useMemo(() => {
    if (!entriesQ.data) return []
    if (draftTickers.size === 0 && draftTagSet.size === 0) return []
    const scored: { id: string; title: string; date: string; score: number; sharedTicker?: string; sharedTag?: string }[] = []
    for (const e of entriesQ.data) {
      if (e.id === excludeEntryId) continue
      const entryTickers = extractTickers(`${e.title_markdown ?? ''} ${e.body_markdown ?? ''}`)
      const entryTags = new Set((e.tags ?? []).map((t) => t.toLowerCase()))
      let score = 0
      let sharedTicker: string | undefined
      let sharedTag: string | undefined
      for (const t of draftTickers) {
        if (entryTickers.has(t)) { score += 2; sharedTicker = t; }
      }
      for (const t of draftTagSet) {
        if (entryTags.has(t)) { score += 1; sharedTag = t; }
      }
      if (score > 0) {
        scored.push({
          id: e.id,
          title: getEntryDisplayTitle(e, e.actions as never) || '(Untitled)',
          date: e.date,
          score,
          sharedTicker,
          sharedTag,
        })
      }
    }
    return scored.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 3)
  }, [entriesQ.data, draftTickers, draftTagSet, excludeEntryId])

  if (hidden) return null
  if (matches.length === 0) return null

  return (
    <Box
      sx={{
        mt: 2,
        p: 1.75,
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: 'grey.50',
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: 'text.disabled',
          letterSpacing: '0.08em',
          fontWeight: 700,
          fontSize: '0.68rem',
          mb: 0.75,
        }}
      >
        Also written about
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {matches.map((m) => (
          <Box key={m.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
            <MuiLink
              component={RouterLink}
              to={`/entries/${m.id}`}
              underline="hover"
              sx={{
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontSize: '0.9rem',
                color: 'text.primary',
                fontWeight: 500,
              }}
            >
              {m.title}
            </MuiLink>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
              · <RelativeDate date={m.date} />
              {m.sharedTicker && ` · $${m.sharedTicker}`}
              {m.sharedTag && !m.sharedTicker && ` · #${m.sharedTag}`}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
