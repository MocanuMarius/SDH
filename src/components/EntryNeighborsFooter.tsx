/**
 * EntryNeighborsFooter — the "page-turn" row at the bottom of an
 * entry: Newer ← · · → Older. Turns the journal into a bound book:
 * you can thumb through entries chronologically without popping back
 * to the list each time.
 *
 * Layout mirrors the newspaper convention: small caps kickers on the
 * ends, an italic "dingbat" divider between them. Sits at the same
 * 68ch max-width as the reading column so it reads as part of the
 * article footer rather than app chrome.
 *
 * Hidden entirely when both neighbors are missing (this is the only
 * entry in the journal).
 */

import { Box, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useEntryNeighbors } from '../hooks/queries'
import { getEntryDisplayTitle } from '../utils/entryTitle'

interface EntryNeighborsFooterProps {
  entry: { id: string; date: string }
}

const KICKER_SX = {
  display: 'block',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontSize: '0.68rem',
  color: 'text.disabled',
  mb: 0.25,
}

export default function EntryNeighborsFooter({ entry }: EntryNeighborsFooterProps) {
  const { data } = useEntryNeighbors(entry)
  const older = data?.older ?? null
  const newer = data?.newer ?? null
  if (!older && !newer) return null

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso + 'T00:00:00')
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <Box
      component="nav"
      aria-label="Entry navigation"
      sx={{
        // Same column as the article body so this reads as part of
        // the reading flow, not the app chrome.
        maxWidth: { xs: '100%', md: '68ch' },
        mx: { xs: 0, md: 'auto' },
        mt: 2,
        mb: 3,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        borderTop: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {/* Left: NEWER (closer to today — in a newspaper you'd flip BACKWARD in the stack to reach it) */}
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        {newer ? (
          <Box
            component={RouterLink}
            to={`/entries/${newer.id}`}
            sx={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'color 140ms ease, transform 140ms ease',
              '&:hover': { color: 'primary.main', transform: 'translateX(-2px)' },
            }}
          >
            <Typography component="span" sx={KICKER_SX}>
              ← Newer
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontStyle: 'italic',
                fontSize: '0.9rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {getEntryDisplayTitle({ title_markdown: newer.title_markdown })}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
              {fmtDate(newer.date)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            Latest entry
          </Typography>
        )}
      </Box>

      {/* Center: a tiny dingbat divider — keeps the two ends optically
          balanced even when only one neighbor exists. */}
      <Box
        aria-hidden
        sx={{
          color: 'text.disabled',
          fontSize: '0.9rem',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        ⁂
      </Box>

      {/* Right: OLDER (further back in time — you'd flip forward through the stack) */}
      <Box sx={{ minWidth: 0, textAlign: 'right' }}>
        {older ? (
          <Box
            component={RouterLink}
            to={`/entries/${older.id}`}
            sx={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'color 140ms ease, transform 140ms ease',
              '&:hover': { color: 'primary.main', transform: 'translateX(2px)' },
            }}
          >
            <Typography component="span" sx={KICKER_SX}>
              Older →
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontStyle: 'italic',
                fontSize: '0.9rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {getEntryDisplayTitle({ title_markdown: older.title_markdown })}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
              {fmtDate(older.date)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            First entry
          </Typography>
        )}
      </Box>
    </Box>
  )
}
