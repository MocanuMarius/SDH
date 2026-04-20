/**
 * PendingDraftBanner — shown at the top of the new-entry form when
 * a draft > 24h old is sitting in localStorage. The "Sunday, April
 * 20, you were writing about $CRC. Continue or discard?" prompt
 * the user can resolve in one click.
 *
 * Doesn't auto-load the stale draft — the writer chooses. Click
 * "Continue" → applies the saved title/body/tags. Click "Discard" →
 * clears the localStorage entry. Either way the banner closes.
 */

import { Box, Button, Typography } from '@mui/material'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'

export interface PendingDraft {
  title_markdown?: string
  body_markdown?: string
  tagsStr?: string
  savedAt: number
}

export interface PendingDraftBannerProps {
  draft: PendingDraft
  onContinue: () => void
  onDiscard: () => void
}

function formatDraftAge(savedAt: number): string {
  const d = new Date(savedAt)
  const dayPart = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${dayPart}, ${timePart}`
}

function pickSubject(draft: PendingDraft): string {
  // Prefer first $TICKER mention from title, then body. Fall back to
  // the first few words of the title.
  const haystack = `${draft.title_markdown ?? ''} ${draft.body_markdown ?? ''}`
  const tickerMatch = haystack.match(/\$([A-Z][A-Z0-9.:]{0,9})/)
  if (tickerMatch) return `$${tickerMatch[1]}`
  const titleWords = (draft.title_markdown ?? '').trim().split(/\s+/).slice(0, 4).join(' ')
  if (titleWords) return `"${titleWords}…"`
  return 'a draft'
}

export default function PendingDraftBanner({ draft, onContinue, onDiscard }: PendingDraftBannerProps) {
  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        bgcolor: 'primary.50',
        border: '1px solid',
        borderColor: 'primary.200',
        borderRadius: 1.5,
      }}
    >
      <Box sx={{ color: 'primary.dark', mt: 0.25 }}>
        <HistoryEduIcon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
            fontStyle: 'italic',
            color: 'text.primary',
          }}
        >
          {formatDraftAge(draft.savedAt)}, you were writing about {pickSubject(draft)}.
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            onClick={onContinue}
            sx={{ textTransform: 'none' }}
          >
            Continue draft
          </Button>
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={onDiscard}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Discard
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
