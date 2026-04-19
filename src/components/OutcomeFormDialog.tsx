/**
 * Outcome dialog — log how a closed decision actually played out.
 *
 * Design goal: the common case is "I closed this, here's what
 * happened, file it." So the top of the form is dead simple: P&L +
 * Date + a one-line note. Below that, three big VERDICT chips
 * (Right / Wrong / Inconclusive) — same shape as
 * `ResolveStaleIdeaDialog` because the same UX worked there. After a
 * verdict is picked, a small Yes/No surfaces for "was your reasoning
 * sound?" so the process-vs-outcome split stays available without
 * forcing a slider.
 *
 * The deeper fields (driver flag, error-type tags, post-mortem
 * paragraphs, 500-word closing memo) all live behind accordions —
 * collapsed by default, opened only when the user wants to write
 * something real. Earlier the form put the process/outcome sliders
 * + driver dropdown front and centre, which made every "log an
 * outcome" feel like a research paper.
 *
 * Schema mapping kept identical to before so old rows + analytics
 * still work:
 *   - Right call    → outcome_score 5, outcome_quality 'good'
 *   - Wrong call    → outcome_score 1, outcome_quality 'bad'
 *   - Inconclusive  → outcome_score 3, outcome_quality null
 *   - Reasoning Yes → process_score 4, process_quality 'good'
 *   - Reasoning No  → process_score 2, process_quality 'bad'
 *   - Driver, post-mortem, closing memo, error types unchanged.
 */

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
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { FormGroup, FormControlLabel, Checkbox, Alert } from '@mui/material'
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

// Verdict chips → outcome_score mapping. 5/3/1 cleanly reads as
// good/neutral/bad in calibration reports and matches the same
// scheme used by ResolveStaleIdeaDialog.
type Verdict = 'right' | 'wrong' | 'inconclusive'
const VERDICT_LABEL: Record<Verdict, string> = {
  right: 'Right call',
  wrong: 'Wrong call',
  inconclusive: 'Inconclusive',
}
const VERDICT_COLOR: Record<Verdict, string> = {
  right: '#16a34a',
  wrong: '#dc2626',
  inconclusive: '#64748b',
}
const VERDICT_SCORE: Record<Verdict, number> = { right: 5, wrong: 1, inconclusive: 3 }
const VERDICT_QUALITY: Record<Verdict, ProcessOutcomeQuality> = {
  right: 'good',
  wrong: 'bad',
  inconclusive: null,
}

/** Process toggle → process_score mapping. 4 = "good enough", 2 = "had gaps". */
type ProcessVerdict = 'sound' | 'gaps' | null
const PROCESS_SCORE: Record<Exclude<ProcessVerdict, null>, number> = { sound: 4, gaps: 2 }
const PROCESS_QUALITY: Record<Exclude<ProcessVerdict, null>, ProcessOutcomeQuality> = {
  sound: 'good',
  gaps: 'bad',
}

/** Reverse-engineer the verdict + process state from an existing
 *  numeric score so editing a saved outcome shows the same chip. */
function scoreToVerdict(score: number | null | undefined): Verdict | null {
  if (score == null) return null
  if (score >= 4) return 'right'
  if (score <= 2) return 'wrong'
  return 'inconclusive'
}
function processScoreToVerdict(score: number | null | undefined): ProcessVerdict {
  if (score == null) return null
  return score >= 3 ? 'sound' : 'gaps'
}

const getToday = () => new Date().toISOString().slice(0, 10)
const DRIVER_OPTIONS: { value: OutcomeDriver; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 'thesis', label: 'Thesis (the writeup drove the result)' },
  { value: 'other', label: 'Other / luck (right for wrong reasons)' },
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
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [processVerdict, setProcessVerdict] = useState<ProcessVerdict>(null)
  const [driver, setDriver] = useState<OutcomeDriver>(initial?.driver ?? null)
  const [post_mortem_notes, setPostMortemNotes] = useState((initial as Outcome & { post_mortem_notes?: string | null })?.post_mortem_notes ?? '')
  const [closing_memo, setClosingMemo] = useState((initial as Outcome & { closing_memo?: string | null })?.closing_memo ?? '')
  const [error_type, setErrorType] = useState<ErrorType[]>(((initial as Outcome & { error_type?: ErrorType[] | null })?.error_type) ?? [])
  const [what_i_remember_now, setWhatIRememberNow] = useState((initial as Outcome & { what_i_remember_now?: string | null })?.what_i_remember_now ?? '')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
      const resolvedProcess = existingProcessScore != null
        ? existingProcessScore
        : legacyProcess === 'good' ? 4 : legacyProcess === 'bad' ? 2 : null
      setProcessVerdict(processScoreToVerdict(resolvedProcess))
      const existingOutcomeScore = (initial as Outcome & { outcome_score?: number | null }).outcome_score
      const legacyOutcome = (initial as Outcome & { outcome_quality?: ProcessOutcomeQuality }).outcome_quality
      const resolvedOutcome = existingOutcomeScore != null
        ? existingOutcomeScore
        : legacyOutcome === 'good' ? 4 : legacyOutcome === 'bad' ? 2 : null
      setVerdict(scoreToVerdict(resolvedOutcome))
      setClosingMemo((initial as Outcome & { closing_memo?: string | null }).closing_memo ?? '')
      setErrorType((initial as Outcome & { error_type?: ErrorType[] | null }).error_type ?? [])
      setWhatIRememberNow((initial as Outcome & { what_i_remember_now?: string | null }).what_i_remember_now ?? '')
    } else if (open && !initial) {
      setRealizedPnl('')
      setOutcomeDate(getToday())
      setNotes('')
      setVerdict(null)
      setProcessVerdict(null)
      setDriver(null)
      setPostMortemNotes('')
      setClosingMemo('')
      setErrorType([])
      setWhatIRememberNow('')
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSubmitError(null)
    try {
      const pnl = realized_pnl.trim() === '' ? null : Number(realized_pnl)
      const outcome_score = verdict ? VERDICT_SCORE[verdict] : null
      const outcome_quality = verdict ? VERDICT_QUALITY[verdict] : null
      const process_score = processVerdict ? PROCESS_SCORE[processVerdict] : null
      const process_quality = processVerdict ? PROCESS_QUALITY[processVerdict] : null
      await onSubmit({
        realized_pnl: pnl,
        outcome_date,
        notes,
        driver,
        post_mortem_notes: post_mortem_notes.trim(),
        process_quality,
        outcome_quality,
        process_score,
        outcome_score,
        closing_memo: closing_memo.trim(),
        error_type: error_type.length ? error_type : null,
        what_i_remember_now: what_i_remember_now.trim(),
      })
      onClose()
    } catch (err) {
      // Surface the error inline instead of leaving the dialog stuck with no feedback.
      const msg = err instanceof Error ? err.message : 'Could not save the outcome'
      setSubmitError(msg)
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
          {/* Result — the only fields the common case really needs. */}
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
            placeholder="One line on what happened"
            multiline
            minRows={2}
            fullWidth
          />

          {/* Verdict — three big chips, same UX shape as
              ResolveStaleIdeaDialog. Replaces the old "Process × Outcome"
              twin-slider section that asked the user to fiddle with two
              0–5 sliders before saving. */}
          <Typography component="span" sx={SECTION_HEADING_SX} display="block">How did it go?</Typography>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 0.75 }}>
            {(['right', 'wrong', 'inconclusive'] as const).map((v) => {
              const selected = verdict === v
              return (
                <Chip
                  key={v}
                  label={VERDICT_LABEL[v]}
                  onClick={() => setVerdict(v)}
                  variant={selected ? 'filled' : 'outlined'}
                  sx={{
                    flex: 1,
                    height: 40,
                    fontSize: '0.9rem',
                    fontWeight: selected ? 700 : 500,
                    borderRadius: 1.5,
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

          {/* Reasoning toggle — only shown after a verdict is picked.
              The whole point of the process-vs-outcome split is that
              "right call but bad reasoning" is a warning even when it
              made money; surfacing the question only after a verdict
              keeps the form quiet for users who don't care. */}
          {verdict && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Was your reasoning sound?
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Chip
                  label="Yes — solid process"
                  size="small"
                  variant={processVerdict === 'sound' ? 'filled' : 'outlined'}
                  color={processVerdict === 'sound' ? 'primary' : 'default'}
                  onClick={() => setProcessVerdict(processVerdict === 'sound' ? null : 'sound')}
                  sx={{ fontWeight: processVerdict === 'sound' ? 700 : 500 }}
                />
                <Chip
                  label="No — gaps"
                  size="small"
                  variant={processVerdict === 'gaps' ? 'filled' : 'outlined'}
                  color={processVerdict === 'gaps' ? 'warning' : 'default'}
                  onClick={() => setProcessVerdict(processVerdict === 'gaps' ? null : 'gaps')}
                  sx={{ fontWeight: processVerdict === 'gaps' ? 700 : 500 }}
                />
              </Box>
            </Box>
          )}

          {/* Deeper fields — collapsed accordions. The common case
              never opens these; the rare "I want to actually write
              this up" case has full breathing room. */}

          {/* Error types accordion */}
          <Accordion disableGutters sx={{ mt: 1, boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                Tag error types {error_type.length > 0 ? `(${error_type.length})` : ''}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Pick any that apply — builds your weakness profile over time.
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

          {/* Post-mortem accordion — bundles the Driver dropdown + the
              two long-form text fields. Driver lives here now (it
              used to sit above the sliders) because it's the rare
              advanced toggle. */}
          <Accordion disableGutters sx={{ boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                Post-mortem &amp; lessons {(post_mortem_notes || what_i_remember_now || driver) && '•'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>What drove the result?</InputLabel>
                <Select
                  value={driver ?? ''}
                  label="What drove the result?"
                  onChange={(e) => setDriver((e.target.value || null) as OutcomeDriver)}
                >
                  {DRIVER_OPTIONS.map((opt) => (
                    <MenuItem key={String(opt.value)} value={opt.value ?? ''}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="What would you do differently?"
                value={post_mortem_notes}
                onChange={(e) => setPostMortemNotes(e.target.value)}
                placeholder="What happened? Where did reasoning fail or succeed? What would you do differently?"
                multiline
                minRows={3}
                fullWidth
              />
              <TextField
                size="small"
                label="What I remember now"
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

          {/* Closing memo accordion — auto-expands when there's
              already content to edit. */}
          <Accordion disableGutters defaultExpanded={closing_memo.trim().length > 0} sx={{ boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="body2" fontWeight={600}>
                Closing memo {closing_memo.trim() && `• ${wordCount(closing_memo)} words`}
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
          {submitError && (
            <Alert
              severity="error"
              onClose={() => setSubmitError(null)}
              sx={{ mt: 1 }}
            >
              {submitError}
            </Alert>
          )}
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
