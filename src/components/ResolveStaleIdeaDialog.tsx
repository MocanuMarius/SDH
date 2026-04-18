/**
 * Stripped-down outcome dialog for closing the loop on a stale ticker.
 *
 * Why this exists separately from `OutcomeFormDialog`:
 *   - Stale ideas are usually tickers the user researched then drifted
 *     away from months ago. The full OutcomeFormDialog asks for
 *     realised P&L, process + outcome scores, error types, post-mortem,
 *     a 500-word closing memo. Almost none of that is fillable for a
 *     ticker the user barely remembers.
 *   - The pass-review flow already has the right UX model — 4 quick
 *     actions (Correct / Missed / ??? / +30d) + optional note. This
 *     dialog mirrors that shape for stale ideas.
 *
 * Flow:
 *   Was your [last action] right on $TICKER?
 *     [ Yes, right ]  [ Wrong ]  [ Inconclusive ]
 *     (optional 1-line note)
 *     [ Save ]
 *
 * Maps into the existing `outcomes` schema so calibration / Insights
 * stats keep updating:
 *   - "Yes" → outcome_score 5
 *   - "Wrong" → outcome_score 1
 *   - "Inconclusive" → outcome_score 3
 *   Process_score is left null (we don't know how thorough the original
 *   research was from this distance). The note, if any, lands in
 *   `notes`. outcome_date = today.
 */

import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import BottomSheet from './BottomSheet'
import type { OutcomeInsert } from '../services/outcomesService'

export type StaleIdeaVerdict = 'right' | 'wrong' | 'inconclusive'

const VERDICT_COLOR: Record<StaleIdeaVerdict, string> = {
  right: '#16a34a',
  wrong: '#dc2626',
  inconclusive: '#64748b',
}

const VERDICT_LABEL: Record<StaleIdeaVerdict, string> = {
  right: 'Right call',
  wrong: 'Wrong call',
  inconclusive: 'Inconclusive',
}

/** Maps a verdict to the existing 1–5 outcome_score scale the rest of
 *  the app uses (Insights, calibration). Kept narrow so the mapping is
 *  reversible — 5/3/1 cleanly reads as good/neutral/bad in reports. */
const VERDICT_SCORE: Record<StaleIdeaVerdict, number> = {
  right: 5,
  wrong: 1,
  inconclusive: 3,
}

export interface ResolveStaleIdeaDialogProps {
  open: boolean
  onClose: () => void
  /** The decision being resolved — renders as the subject of "was this right?". */
  actionLabel: string
  /** Fired when the user taps Save. Parent persists via createOutcome. */
  onSubmit: (payload: Pick<OutcomeInsert, 'action_id' | 'outcome_date' | 'notes' | 'outcome_score' | 'outcome_quality' | 'driver'>) => Promise<void>
  /** The action id to attach the outcome to. */
  actionId: string
}

export default function ResolveStaleIdeaDialog({
  open,
  onClose,
  actionLabel,
  actionId,
  onSubmit,
}: ResolveStaleIdeaDialogProps) {
  const [verdict, setVerdict] = useState<StaleIdeaVerdict | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!verdict || saving) return
    setSaving(true)
    try {
      await onSubmit({
        action_id: actionId,
        outcome_date: new Date().toISOString().slice(0, 10),
        notes: note.trim(),
        outcome_score: VERDICT_SCORE[verdict],
        // Keep the legacy binary column in sync for old consumers.
        outcome_quality: verdict === 'right' ? 'good' : verdict === 'wrong' ? 'bad' : null,
        // Driver isn't meaningful at this distance from the decision; leave null.
        driver: null,
      })
      onClose()
      // Reset state for the next open.
      setVerdict(null)
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle sx={{ pb: 0.5 }}>
        Close the loop on {actionLabel}
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Looking back — was the original decision right?
        </Typography>

        {/* Three big tap targets. Chip-style so the selected one reads
            clearly as a verdict, not a form field. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {(['right', 'wrong', 'inconclusive'] as const).map((v) => {
            const selected = verdict === v
            return (
              <Chip
                key={v}
                label={VERDICT_LABEL[v]}
                onClick={() => setVerdict(v)}
                variant={selected ? 'filled' : 'outlined'}
                sx={{
                  height: 40,
                  fontSize: '0.9rem',
                  fontWeight: selected ? 700 : 500,
                  borderRadius: 1.5,
                  justifyContent: 'flex-start',
                  px: 1.5,
                  bgcolor: selected ? VERDICT_COLOR[v] : 'transparent',
                  color: selected ? '#fff' : VERDICT_COLOR[v],
                  borderColor: VERDICT_COLOR[v],
                  borderWidth: 1.5,
                  '&:hover': {
                    bgcolor: selected ? VERDICT_COLOR[v] : `${VERDICT_COLOR[v]}15`,
                  },
                }}
              />
            )
          })}
        </Box>

        <TextField
          size="small"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — one line on what you'd do differently"
          multiline
          minRows={2}
          fullWidth
        />

        <Typography variant="caption" color="text.secondary">
          Skipping the full outcome form on purpose — for stale ideas this
          is usually all that can honestly be filled in. Go to the decision
          itself if you want to log P&amp;L, process scores, or a post-mortem.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!verdict || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </BottomSheet>
  )
}
