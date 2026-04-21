/**
 * OutcomeForm — the fields-only version of the outcome editor.
 * Refactored out of OutcomeFormDialog (which wrapped it in a
 * BottomSheet). This component is rendered by OutcomeFormPage at
 * /outcomes/new + /outcomes/:id/edit so the long-form reflection
 * gets real page width instead of a modal scroll.
 *
 * Layout changes from the dialog version:
 *  - Linear flow with hairline rules between sections (no more
 *    nested accordions stuffed inside a bottom sheet).
 *  - "What would you do differently?" + Closing memo merged into a
 *    single "Lesson" field — the duplication made both feel less
 *    important.
 *  - "What I remember now" stays distinct because it probes a
 *    different thing: hindsight bias (then vs now).
 *  - Error-types and realised P&L live at the bottom as quiet
 *    "advanced" slots rather than accordion-hidden.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import type { Outcome, OutcomeDriver, ProcessOutcomeQuality, ErrorType } from '../types/database'
import { ERROR_TYPES } from '../types/database'
import { todayISO } from '../utils/dates'
import { ERROR_TYPE_LABELS } from '../utils/errorTypeLabels'

const SECTION_LABEL = { fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'text.secondary', mb: 0.75, mt: 0.25 }
const MEMO_WORD_CAP = 500

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

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
const VERDICT_QUALITY: Record<Verdict, ProcessOutcomeQuality> = { right: 'good', wrong: 'bad', inconclusive: null }

type ProcessVerdict = 'sound' | 'gaps' | null
const PROCESS_SCORE: Record<Exclude<ProcessVerdict, null>, number> = { sound: 4, gaps: 2 }
const PROCESS_QUALITY: Record<Exclude<ProcessVerdict, null>, ProcessOutcomeQuality> = { sound: 'good', gaps: 'bad' }

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

const DRIVER_OPTIONS: { value: OutcomeDriver; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 'thesis', label: 'Thesis (the writeup drove the result)' },
  { value: 'other', label: 'Other / luck (right for wrong reasons)' },
]

export interface OutcomeFormData {
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
  /** Days from today to schedule a follow-up reminder. The host
   *  creates the actual `reminders` row when non-null. */
  follow_up_in_days: number | null
}

export interface OutcomeFormProps {
  initial: Outcome | null
  onSubmit: (data: OutcomeFormData) => Promise<void>
  onCancel: () => void
  actionLabel?: string
}

export default function OutcomeForm({ initial, onSubmit, onCancel, actionLabel }: OutcomeFormProps) {
  const [realized_pnl, setRealizedPnl] = useState<string>(initial?.realized_pnl != null ? String(initial.realized_pnl) : '')
  const [outcome_date, setOutcomeDate] = useState(initial?.outcome_date ?? todayISO())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [verdict, setVerdict] = useState<Verdict | null>(() => {
    const s = (initial as Outcome & { outcome_score?: number | null })?.outcome_score
    const legacy = (initial as Outcome & { outcome_quality?: ProcessOutcomeQuality })?.outcome_quality
    const resolved = s != null ? s : legacy === 'good' ? 4 : legacy === 'bad' ? 2 : null
    return scoreToVerdict(resolved)
  })
  const [processVerdict, setProcessVerdict] = useState<ProcessVerdict>(() => {
    const s = (initial as Outcome & { process_score?: number | null })?.process_score
    const legacy = (initial as Outcome & { process_quality?: ProcessOutcomeQuality })?.process_quality
    const resolved = s != null ? s : legacy === 'good' ? 4 : legacy === 'bad' ? 2 : null
    return processScoreToVerdict(resolved)
  })
  const [followUpDays, setFollowUpDays] = useState<number | null>(initial ? null : 60)
  const [driver, setDriver] = useState<OutcomeDriver>(initial?.driver ?? null)
  /** Merged lesson field — replaces the previous split between
   *  `post_mortem_notes` and `closing_memo` which asked very
   *  similar questions. On save we write the trimmed text to
   *  `closing_memo` (the newer column). `post_mortem_notes` is
   *  left as whatever was already there for legacy rows; new
   *  content flows through the single field. */
  const [lesson, setLesson] = useState(
    (initial as Outcome & { closing_memo?: string | null })?.closing_memo ??
    (initial as Outcome & { post_mortem_notes?: string | null })?.post_mortem_notes ??
    ''
  )
  const [error_type, setErrorType] = useState<ErrorType[]>(((initial as Outcome & { error_type?: ErrorType[] | null })?.error_type) ?? [])
  const [what_i_remember_now, setWhatIRememberNow] = useState((initial as Outcome & { what_i_remember_now?: string | null })?.what_i_remember_now ?? '')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Sync state when `initial` updates mid-render (rare — edit flow
  // fetches async, so `initial` can land after mount).
  useEffect(() => {
    if (!initial) return
    setRealizedPnl(initial.realized_pnl != null ? String(initial.realized_pnl) : '')
    setOutcomeDate(initial.outcome_date ?? todayISO())
    setNotes(initial.notes ?? '')
    setDriver(initial.driver ?? null)
    setLesson(
      (initial as Outcome & { closing_memo?: string | null }).closing_memo ??
      (initial as Outcome & { post_mortem_notes?: string | null }).post_mortem_notes ??
      ''
    )
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
    setErrorType((initial as Outcome & { error_type?: ErrorType[] | null }).error_type ?? [])
    setWhatIRememberNow((initial as Outcome & { what_i_remember_now?: string | null }).what_i_remember_now ?? '')
  }, [initial])

  const toggleErrorType = (t: ErrorType) => {
    setErrorType((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

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
        // Write the merged field to both columns so legacy readers
        // (old analytics queries, old exports) see continuity. New
        // reads should prefer closing_memo per the type comment.
        post_mortem_notes: lesson.trim(),
        process_quality,
        outcome_quality,
        process_score,
        outcome_score,
        closing_memo: lesson.trim(),
        error_type: error_type.length ? error_type : null,
        what_i_remember_now: what_i_remember_now.trim(),
        follow_up_in_days: followUpDays,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the outcome'
      setSubmitError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Primary: Date + one-line notes */}
        <Box>
          <Typography sx={SECTION_LABEL}>Outcome</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Date"
              type="date"
              value={outcome_date}
              onChange={(e) => setOutcomeDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 170 }}
            />
            <TextField
              size="small"
              label="What happened"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="One line — the chart tells the rest of the story"
              sx={{ flex: 1, minWidth: 260 }}
            />
          </Box>
        </Box>

        <Divider />

        {/* Verdict: three big chips */}
        <Box>
          <Typography sx={SECTION_LABEL}>How did it go?{actionLabel ? ` — ${actionLabel}` : ''}</Typography>
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
                    height: 44,
                    fontSize: '0.95rem',
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
          {verdict && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Was your reasoning sound?
              </Typography>
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
          )}
        </Box>

        <Divider />

        {/* Follow-up reminder chips */}
        <Box>
          <Typography sx={SECTION_LABEL}>Check back later</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            Schedule a reminder so you can compare how the stock actually moved against your verdict.
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {[
              { days: 30, label: '1 month' },
              { days: 60, label: '2 months' },
              { days: 90, label: '3 months' },
              { days: 180, label: '6 months' },
              { days: 365, label: '1 year' },
            ].map((opt) => {
              const selected = followUpDays === opt.days
              return (
                <Chip
                  key={opt.days}
                  label={opt.label}
                  size="small"
                  variant={selected ? 'filled' : 'outlined'}
                  color={selected ? 'primary' : 'default'}
                  onClick={() => setFollowUpDays(selected ? null : opt.days)}
                  sx={{ fontWeight: selected ? 700 : 500 }}
                />
              )
            })}
            <Chip
              label="No reminder"
              size="small"
              variant={followUpDays === null ? 'filled' : 'outlined'}
              onClick={() => setFollowUpDays(null)}
              sx={{ fontWeight: followUpDays === null ? 700 : 500, color: followUpDays === null ? 'text.secondary' : undefined }}
            />
          </Box>
        </Box>

        <Divider />

        {/* Lesson — merged post-mortem + closing memo */}
        <Box>
          <Typography sx={SECTION_LABEL}>The lesson</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            What happened, where reasoning failed or succeeded, and what you'd do differently. 500-word cap — precision forces clarity.
          </Typography>
          <TextField
            size="small"
            value={lesson}
            onChange={(e) => {
              const next = e.target.value
              if (wordCount(next) <= MEMO_WORD_CAP) setLesson(next)
            }}
            placeholder="Write in your own words what this decision taught you."
            multiline
            minRows={6}
            fullWidth
            helperText={`${wordCount(lesson)} / ${MEMO_WORD_CAP} words`}
            FormHelperTextProps={{
              sx: {
                color:
                  wordCount(lesson) === 0
                    ? 'text.secondary'
                    : wordCount(lesson) < MEMO_WORD_CAP * 0.9
                      ? 'success.main'
                      : 'warning.main',
              },
            }}
          />
        </Box>

        <Divider />

        {/* What I remember now — distinct from the lesson; this is the hindsight-bias probe */}
        <Box>
          <Typography sx={SECTION_LABEL}>What I remember now</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            Then-vs-now — compare to your pre-decision reason to spot hindsight bias.
          </Typography>
          <TextField
            size="small"
            value={what_i_remember_now}
            onChange={(e) => setWhatIRememberNow(e.target.value)}
            placeholder="What was your reasoning at entry, as you remember it now?"
            multiline
            minRows={3}
            fullWidth
          />
        </Box>

        <Divider />

        {/* Advanced — error types + driver + optional realised P&L */}
        <Box>
          <Typography sx={SECTION_LABEL}>Error types (optional)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            Pick any that apply. Builds a weakness profile over time.
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
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ flex: 1, minWidth: 220 }}>
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
            label="Realised P&L (optional)"
            type="number"
            value={realized_pnl}
            onChange={(e) => setRealizedPnl(e.target.value)}
            placeholder="e.g. 150.50"
            inputProps={{ step: 0.01 }}
            sx={{ width: 180 }}
          />
        </Box>

        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* Sticky save bar — same pattern as EntryFormPage / ActionForm */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            mt: 2,
            position: { xs: 'sticky', sm: 'static' },
            bottom: { xs: 56, sm: 'auto' },
            bgcolor: { xs: 'background.default', sm: 'transparent' },
            pt: { xs: 1, sm: 0 },
            pb: { xs: 1, sm: 0 },
            borderTop: { xs: '1px solid', sm: 'none' },
            borderColor: 'divider',
            mx: { xs: -1.5, sm: 0 },
            px: { xs: 1.5, sm: 0 },
            zIndex: 4,
          }}
        >
          <Button onClick={onCancel} variant="outlined">Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={!saving ? <CheckIcon /> : null}>
            {saving ? 'Saving…' : initial?.id ? 'Save outcome' : 'File the outcome'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
