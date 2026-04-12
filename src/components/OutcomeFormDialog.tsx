import { useState, useEffect } from 'react'
import {
  Box,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Divider,
  Slider,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { FormGroup, FormControlLabel, Checkbox } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import BottomSheet from './BottomSheet'
import type { Outcome, OutcomeDriver, ProcessOutcomeQuality, ErrorType } from '../types/database'
import { ERROR_TYPES } from '../types/database'
import { ERROR_TYPE_LABELS } from '../utils/errorTypeLabels'

const SECTION_HEADING_SX = { fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', mb: 1, mt: 0.5 }

interface OutcomeFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    realized_pnl: number | null
    outcome_date: string
    notes: string
    driver: OutcomeDriver
    post_mortem_notes: string
    process_quality: ProcessOutcomeQuality
    outcome_quality: ProcessOutcomeQuality
    process_score: number | null
    outcome_score: number | null
    closing_memo: string
    error_type: ErrorType[] | null
    what_i_remember_now: string
  }) => Promise<void>
  initial: Outcome | null
  actionLabel?: string
}

const MEMO_WORD_CAP = 500

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

const MEMO_TEMPLATE = `**Original thesis**
(one sentence)

**What happened**


**Where reasoning was right / wrong**


**What I would do differently**


**Recurring theme for the lesson library**
`

const SCORE_LABELS: Record<number, string> = {
  1: '1 — poor',
  2: '2',
  3: '3 — ok',
  4: '4',
  5: '5 — excellent',
}

/** >=3 maps to binary 'good', <3 to 'bad', null stays null. Kept for back-compat. */
function scoreToBinary(score: number | null): ProcessOutcomeQuality {
  if (score == null) return null
  return score >= 3 ? 'good' : 'bad'
}

const getToday = () => new Date().toISOString().slice(0, 10)
const DRIVER_OPTIONS: { value: OutcomeDriver; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 'thesis', label: 'Thesis (thesis drove the result)' },
  { value: 'other', label: 'Other (e.g. luck; right for wrong reasons)' },
]

export default function OutcomeFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
  actionLabel,
}: OutcomeFormDialogProps) {
  
  const [realized_pnl, setRealizedPnl] = useState<string>(initial?.realized_pnl != null ? String(initial.realized_pnl) : '')
  const [outcome_date, setOutcomeDate] = useState(initial?.outcome_date ?? getToday())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [driver, setDriver] = useState<OutcomeDriver>(initial?.driver ?? null)
  const [post_mortem_notes, setPostMortemNotes] = useState((initial as Outcome & { post_mortem_notes?: string | null })?.post_mortem_notes ?? '')
  const [process_score, setProcessScore] = useState<number | null>((initial as Outcome & { process_score?: number | null })?.process_score ?? null)
  const [outcome_score, setOutcomeScore] = useState<number | null>((initial as Outcome & { outcome_score?: number | null })?.outcome_score ?? null)
  const [closing_memo, setClosingMemo] = useState((initial as Outcome & { closing_memo?: string | null })?.closing_memo ?? '')
  const [error_type, setErrorType] = useState<ErrorType[]>(((initial as Outcome & { error_type?: ErrorType[] | null })?.error_type) ?? [])
  const [what_i_remember_now, setWhatIRememberNow] = useState((initial as Outcome & { what_i_remember_now?: string | null })?.what_i_remember_now ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && initial) {
      setRealizedPnl(initial.realized_pnl != null ? String(initial.realized_pnl) : '')
      setOutcomeDate(initial.outcome_date ?? getToday())
      setNotes(initial.notes ?? '')
      setDriver(initial.driver ?? null)
      setPostMortemNotes((initial as Outcome & { post_mortem_notes?: string | null }).post_mortem_notes ?? '')
      // Prefer new numeric score; fall back to legacy binary (good=4, bad=2) so old rows still edit cleanly.
      const existingProcessScore = (initial as Outcome & { process_score?: number | null }).process_score
      const legacyProcess = (initial as Outcome & { process_quality?: ProcessOutcomeQuality }).process_quality
      setProcessScore(
        existingProcessScore != null ? existingProcessScore : legacyProcess === 'good' ? 4 : legacyProcess === 'bad' ? 2 : null
      )
      const existingOutcomeScore = (initial as Outcome & { outcome_score?: number | null }).outcome_score
      const legacyOutcome = (initial as Outcome & { outcome_quality?: ProcessOutcomeQuality }).outcome_quality
      setOutcomeScore(
        existingOutcomeScore != null ? existingOutcomeScore : legacyOutcome === 'good' ? 4 : legacyOutcome === 'bad' ? 2 : null
      )
      setClosingMemo((initial as Outcome & { closing_memo?: string | null }).closing_memo ?? '')
      setErrorType((initial as Outcome & { error_type?: ErrorType[] | null }).error_type ?? [])
      setWhatIRememberNow((initial as Outcome & { what_i_remember_now?: string | null }).what_i_remember_now ?? '')
    } else if (open && !initial) {
      setRealizedPnl('')
      setOutcomeDate(getToday())
      setNotes('')
      setDriver(null)
      setPostMortemNotes('')
      setProcessScore(null)
      setOutcomeScore(null)
      setClosingMemo('')
      setErrorType([])
      setWhatIRememberNow('')
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const pnl = realized_pnl.trim() === '' ? null : Number(realized_pnl)
      await onSubmit({
        realized_pnl: pnl,
        outcome_date,
        notes,
        driver,
        post_mortem_notes: post_mortem_notes.trim(),
        // Keep legacy binary field synced with new 1-5 score so old views still work.
        process_quality: scoreToBinary(process_score),
        outcome_quality: scoreToBinary(outcome_score),
        process_score,
        outcome_score,
        closing_memo: closing_memo.trim(),
        error_type: error_type.length ? error_type : null,
        what_i_remember_now: what_i_remember_now.trim(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toggleErrorType = (t: ErrorType) => {
    setErrorType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle sx={{ pb: 0 }}>
        {initial?.id ? 'Edit outcome' : 'Add outcome'}
        {actionLabel ? ` — ${actionLabel}` : ''}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1.5, overflowY: 'auto' }}>
          {/* Outcome basics */}
          <Typography component="span" sx={SECTION_HEADING_SX} display="block">Result</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <TextField
              size="small"
              label="Realized P&L"
              type="number"
              value={realized_pnl}
              onChange={(e) => setRealizedPnl(e.target.value)}
              placeholder="e.g. 150.50 or -20"
              inputProps={{ step: 0.01 }}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label="Date"
              type="date"
              value={outcome_date}
              onChange={(e) => setOutcomeDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />
          </Box>
          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Short outcome notes"
            multiline
            minRows={2}
            fullWidth
          />

          <Divider sx={{ my: 0.5 }} />

          {/* Driver & scores */}
          <Typography component="span" sx={SECTION_HEADING_SX} display="block">Process × Outcome (R19)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5, mb: 0.5, display: 'block' }}>
            Score process and outcome independently. A good-process / bad-outcome trade is a win. A bad-process / good-outcome trade is a warning.
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>Driver</InputLabel>
            <Select
              value={driver ?? ''}
              label="Driver"
              onChange={(e) => setDriver((e.target.value || null) as OutcomeDriver)}
            >
              {DRIVER_OPTIONS.map((opt) => (
                <MenuItem key={String(opt.value)} value={opt.value ?? ''}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack spacing={2} sx={{ px: 1, py: 0.5 }}>
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="baseline">
                <Typography variant="body2" fontWeight={600}>
                  Process score
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {process_score != null ? SCORE_LABELS[process_score] : 'not set'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Was research adequate? Reasoning sound given what you knew? Bias-aware? Rules followed?
              </Typography>
              <Slider
                value={process_score ?? 0}
                onChange={(_, v) => setProcessScore(v === 0 ? null : (v as number))}
                min={0}
                max={5}
                step={1}
                marks={[
                  { value: 0, label: '—' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                  { value: 5, label: '5' },
                ]}
                size="small"
              />
            </Box>
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="baseline">
                <Typography variant="body2" fontWeight={600}>
                  Outcome score
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {outcome_score != null ? SCORE_LABELS[outcome_score] : 'not set'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Independent of process — did the trade actually make money?
              </Typography>
              <Slider
                value={outcome_score ?? 0}
                onChange={(_, v) => setOutcomeScore(v === 0 ? null : (v as number))}
                min={0}
                max={5}
                step={1}
                marks={[
                  { value: 0, label: '—' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                  { value: 5, label: '5' },
                ]}
                size="small"
              />
            </Box>
          </Stack>

          {/* Error type — compact accordion so the essential fields stay visible */}
          <Accordion disableGutters sx={{ mt: 1, boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                Error type {error_type.length > 0 ? `(${error_type.length})` : ''}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Weakness profile (F21). Pick any that apply.
              </Typography>
              <FormGroup row sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                {ERROR_TYPES.map((t) => (
                  <FormControlLabel
                    key={t}
                    control={
                      <Checkbox
                        size="small"
                        checked={error_type.includes(t)}
                        onChange={() => toggleErrorType(t)}
                      />
                    }
                    label={ERROR_TYPE_LABELS[t]}
                  />
                ))}
              </FormGroup>
            </AccordionDetails>
          </Accordion>

          {/* Post-mortem — accordion */}
          <Accordion disableGutters sx={{ boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                Post-mortem / learning {(post_mortem_notes || what_i_remember_now) && '•'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                size="small"
                label="What would you do differently? (F13)"
                value={post_mortem_notes}
                onChange={(e) => setPostMortemNotes(e.target.value)}
                placeholder="What happened? Where did reasoning fail or succeed? What would you do differently?"
                multiline
                minRows={3}
                fullWidth
                helperText="What happened → where reasoning failed/succeeded → do differently"
              />
              <TextField
                size="small"
                label="What I remember now (F29)"
                value={what_i_remember_now}
                onChange={(e) => setWhatIRememberNow(e.target.value)}
                placeholder="Compare to your pre-decision reason to spot hindsight bias"
                multiline
                minRows={2}
                fullWidth
                helperText="Then vs now — surface hindsight bias"
              />
            </AccordionDetails>
          </Accordion>

          {/* 500-word closing memo — accordion (R14) */}
          <Accordion disableGutters defaultExpanded={closing_memo.trim().length > 0} sx={{ boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                500-word closing memo (R14) {closing_memo.trim() && `• ${wordCount(closing_memo)} words`}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                The word limit forces precision. Original thesis → what happened → reasoning errors → do differently → recurring theme.
              </Typography>
              {closing_memo.trim() === '' && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setClosingMemo(MEMO_TEMPLATE)}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', p: 0, minHeight: 0, mb: 1 }}
                >
                  Insert template
                </Button>
              )}
              <TextField
                size="small"
                label="Closing memo"
                value={closing_memo}
                onChange={(e) => {
                  const next = e.target.value
                  if (wordCount(next) <= MEMO_WORD_CAP) setClosingMemo(next)
                }}
                placeholder="Write in your own words what this decision taught you."
                multiline
                minRows={6}
                fullWidth
                helperText={`${wordCount(closing_memo)} / ${MEMO_WORD_CAP} words`}
                FormHelperTextProps={{
                  sx: {
                    color:
                      wordCount(closing_memo) === 0
                        ? 'text.secondary'
                        : wordCount(closing_memo) < MEMO_WORD_CAP * 0.9
                          ? 'success.main'
                          : 'warning.main',
                  },
                }}
              />
            </AccordionDetails>
          </Accordion>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5, pt: 0 }}>
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={!saving ? <CheckIcon /> : null}>
            {saving ? 'Saving…' : initial?.id ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </BottomSheet>
  )
}
