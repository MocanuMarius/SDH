/**
 * DraftsDrawer — list of every in-progress entry draft held in
 * localStorage, with Resume and Delete affordances.
 *
 * Model: a draft is a "bookmark" in a piece of writing the user
 * hasn't committed to DB yet. The drawer is the source of truth
 * for "what am I still thinking about but haven't finished?" —
 * complements the Journal list (saved entries) and the Reminders
 * dot (things to come back to on a schedule).
 *
 * Dismissible by the usual MUI Drawer affordances (backdrop click,
 * ESC, close button). No "dismiss forever" action — drafts persist
 * until they're explicitly resumed-and-saved or deleted.
 *
 * Anchored right on desktop, bottom (sheet) on mobile. Mirrors the
 * activity / notification drawer pattern used elsewhere in the app.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  Button,
  Stack,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'
import AddIcon from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import { listDrafts, deleteDraft, draftSubject, type EntryDraft } from '../utils/entryDrafts'
import RelativeDate from './RelativeDate'

export interface DraftsDrawerProps {
  open: boolean
  onClose: () => void
  /** Optional hook fired after a draft is deleted from this drawer,
   *  so the host (e.g. EntryListPage) can refresh its draft count. */
  onChanged?: () => void
}

export default function DraftsDrawer({ open, onClose, onChanged }: DraftsDrawerProps) {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [drafts, setDrafts] = useState<EntryDraft[]>([])

  // Refresh the draft list every time the drawer opens. Drafts can
  // change in another tab; the read is cheap (localStorage) so just
  // re-read on each open rather than subscribing to storage events.
  useEffect(() => {
    if (open) setDrafts(listDrafts())
  }, [open])

  const handleResume = (id: string) => {
    onClose()
    navigate(`/entries/new?draft=${encodeURIComponent(id)}`)
  }

  const handleDelete = (id: string) => {
    deleteDraft(id)
    setDrafts(listDrafts())
    onChanged?.()
  }

  const handleNewFresh = () => {
    onClose()
    navigate('/entries/new?fresh=1')
  }

  const bodyBlurb = (draft: EntryDraft): string => {
    const body = (draft.body_markdown || '').replace(/\s+/g, ' ').trim()
    if (!body) return ''
    return body.length <= 140 ? body : body.slice(0, 140).trimEnd() + '…'
  }

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          maxHeight: { xs: '80vh', sm: '100%' },
          borderTopLeftRadius: { xs: 12, sm: 0 },
          borderTopRightRadius: { xs: 12, sm: 0 },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header — masthead kicker + close */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <HistoryEduIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ display: 'block', lineHeight: 1.1, color: 'text.disabled', letterSpacing: '0.12em', fontSize: '0.62rem' }}>
              Unfinished
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontSize: '1.05rem',
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              Drafts {drafts.length > 0 && <Typography component="span" variant="body2" color="text.disabled" sx={{ ml: 0.5 }}>({drafts.length})</Typography>}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Close drafts" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
          {drafts.length === 0 ? (
            <Box
              sx={{
                textAlign: 'center',
                color: 'text.secondary',
                py: 4,
                fontStyle: 'italic',
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>No drafts yet.</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                Any in-progress entry is auto-saved every 30 seconds and appears here until you save or discard it.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {drafts.map((draft) => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  subject={draftSubject(draft)}
                  blurb={bodyBlurb(draft)}
                  onResume={() => handleResume(draft.id)}
                  onDelete={() => handleDelete(draft.id)}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Footer — "Start a new draft" shortcut. Available even when
            the list isn't empty, in case the writer wants to start
            something unrelated without first resuming an old one. */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleNewFresh}
            sx={{ textTransform: 'none' }}
          >
            Start a new draft
          </Button>
        </Box>
      </Box>
    </Drawer>
  )
}

interface DraftRowProps {
  draft: EntryDraft
  subject: string
  blurb: string
  onResume: () => void
  onDelete: () => void
}

function DraftRow({ draft, subject, blurb, onResume, onDelete }: DraftRowProps) {
  const title = (draft.title_markdown || '').trim()
  const tags = (draft.tagsStr || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3)
  const savedIso = useMemo(() => new Date(draft.savedAt).toISOString(), [draft.savedAt])

  return (
    <Box
      onClick={onResume}
      sx={{
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: 'background.paper',
        transition: 'background-color 140ms ease, border-color 140ms ease, transform 140ms ease',
        '@media (hover: hover)': {
          '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.light', transform: 'translateY(-1px)' },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              fontWeight: 700,
              fontSize: '0.95rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title || subject}
          </Typography>
          {blurb && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                mt: 0.25,
                fontStyle: 'italic',
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                color: 'text.secondary',
              }}
            >
              {blurb}
            </Typography>
          )}
          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.disabled">
              Saved <RelativeDate date={savedIso} variant="caption" sx={{ color: 'inherit' }} />
            </Typography>
            {tags.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                · {tags.join(', ')}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton
          size="small"
          aria-label="Delete draft"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  )
}
