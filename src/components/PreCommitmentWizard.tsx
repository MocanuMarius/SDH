/**
 * Pre-commitment wizard for new buy / add_more decisions.
 *
 * Implements the framework's R2 (sub-predictions), R9 (pre-decision journal),
 * R25 (required-field checklist), and R26 (pre-commit kill conditions).
 *
 * The goal is to make the *act of opening a position* carry enough friction
 * that hindsight bias can't rewrite the thesis later. Each step gates the
 * next. Nothing about this flow is optional — that is the point.
 *
 * On submit, the wizard returns an `action` payload (compatible with createAction)
 * and optionally a `prediction` payload (for createPrediction) that links the
 * sub-prediction to a deliberate-practice sub-skill. The parent component is
 * responsible for persisting both.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import TickerAutocomplete from './TickerAutocomplete'
import ReasonField from './ReasonField'
import { SUB_SKILLS, SUB_SKILL_LABELS } from '../types/subSkills'
import type { SubSkill } from '../types/subSkills'

/** Mirrors ActionInsert but only the fields the wizard collects. Kept in-file so callers don't need to import Action types. */
export interface PreCommitmentActionPayload {
  type: 'buy' | 'add_more'
  ticker: string
  company_name: string
  action_date: string
  price: string
  currency: string
  shares: number | null
  reason: string
  notes: string
  kill_criteria: string
  pre_mortem_text: string
}

/** Optional sub-prediction captured during the wizard — handed back for createPrediction. */
export interface PreCommitmentPredictionPayload {
  label: string
  probability: number
  end_date: string
  sub_skill: SubSkill
}

export interface PreCommitmentWizardResult {
  action: PreCommitmentActionPayload
  prediction: PreCommitmentPredictionPayload | null
}

interface PreCommitmentWizardProps {
  open: boolean
  onClose: () => void
  onSubmit: (result: PreCommitmentWizardResult) => Promise<void>
}

interface RiskRow {
  text: string
  probability: number
}

interface CatalystRow {
  text: string
  expected_date: string
}

const getToday = () => new Date().toISOString().slice(0, 10)
const daysAhead = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const STEPS = [
  'Basics',
  'Thesis',
  'Risks',
  'Catalysts',
  'Sub-prediction',
  'Kill conditions',
  'Information edge',
  'Review',
]

const MIN_THESIS_WORDS = 20
const MIN_INFO_EDGE_WORDS = 15

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export default function PreCommitmentWizard({ open, onClose, onSubmit }: PreCommitmentWizardProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Step 1 — Basics
  const [type, setType] = useState<'buy' | 'add_more'>('buy')
  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [actionDate, setActionDate] = useState(getToday())
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shares, setShares] = useState<number | ''>('')

  // Step 2 — Thesis
  const [thesis, setThesis] = useState('')

  // Step 3 — Risks
  const [risks, setRisks] = useState<RiskRow[]>([
    { text: '', probability: 20 },
    { text: '', probability: 20 },
    { text: '', probability: 20 },
  ])

  // Step 4 — Catalysts
  const [catalysts, setCatalysts] = useState<CatalystRow[]>([{ text: '', expected_date: daysAhead(90) }])

  // Step 5 — Sub-prediction
  const [predictionLabel, setPredictionLabel] = useState('')
  const [predictionProbability, setPredictionProbability] = useState(60)
  const [predictionEndDate, setPredictionEndDate] = useState(daysAhead(180))
  const [predictionSubSkill, setPredictionSubSkill] = useState<SubSkill>('valuation_accuracy')

  // Step 6 — Kill conditions
  const [killConditions, setKillConditions] = useState('')

  // Step 7 — Information edge
  const [infoEdge, setInfoEdge] = useState('')

  // Reset every field when the dialog closes so next-open starts clean.
  useEffect(() => {
    if (!open) {
      setStep(0)
      setSaving(false)
      setSubmitError(null)
      setType('buy')
      setTicker('')
      setCompanyName('')
      setActionDate(getToday())
      setPrice('')
      setCurrency('USD')
      setShares('')
      setThesis('')
      setRisks([
        { text: '', probability: 20 },
        { text: '', probability: 20 },
        { text: '', probability: 20 },
      ])
      setCatalysts([{ text: '', expected_date: daysAhead(90) }])
      setPredictionLabel('')
      setPredictionProbability(60)
      setPredictionEndDate(daysAhead(180))
      setPredictionSubSkill('valuation_accuracy')
      setKillConditions('')
      setInfoEdge('')
    }
  }, [open])

  const handleTickerSelect = async (r: { symbol: string; name: string }) => {
    setCompanyName(r.name)
    setTicker(r.symbol)
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(r.symbol)}`)
      if (res.ok) {
        const data = (await res.json()) as { price?: number; currency?: string }
        if (data.price) setPrice(String(data.price))
        if (data.currency) setCurrency(data.currency)
      }
    } catch {
      /* user can type manually */
    }
  }

  // ---- Per-step validation (gates the Next button) ----
  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return ticker.trim().length > 0 && price.trim().length > 0 && actionDate.length > 0
      case 1:
        return wordCount(thesis) >= MIN_THESIS_WORDS
      case 2: {
        // At least one risk with text
        return risks.filter((r) => r.text.trim().length > 0).length >= 1
      }
      case 3: {
        return catalysts.filter((c) => c.text.trim().length > 0).length >= 1
      }
      case 4:
        return predictionLabel.trim().length > 0
      case 5:
        return killConditions.trim().length > 0
      case 6:
        return wordCount(infoEdge) >= MIN_INFO_EDGE_WORDS
      case 7:
        return true
      default:
        return false
    }
  }, [step, ticker, price, actionDate, thesis, risks, catalysts, predictionLabel, killConditions, infoEdge])

  // ---- Serialization into notes markdown for the Action record ----
  const notesMarkdown = useMemo(() => {
    const validRisks = risks.filter((r) => r.text.trim().length > 0)
    const validCats = catalysts.filter((c) => c.text.trim().length > 0)
    const parts: string[] = []
    if (validRisks.length > 0) {
      parts.push('**Risks**')
      validRisks.forEach((r) => parts.push(`- ${r.text.trim()} — ~${r.probability}%`))
    }
    if (validCats.length > 0) {
      if (parts.length > 0) parts.push('')
      parts.push('**Catalysts**')
      validCats.forEach((c) => parts.push(`- ${c.text.trim()} — by ${c.expected_date}`))
    }
    if (predictionLabel.trim().length > 0) {
      if (parts.length > 0) parts.push('')
      parts.push('**Sub-prediction**')
      parts.push(
        `- "${predictionLabel.trim()}" — ${predictionProbability}% by ${predictionEndDate} (${SUB_SKILL_LABELS[predictionSubSkill]})`,
      )
    }
    return parts.join('\n')
  }, [risks, catalysts, predictionLabel, predictionProbability, predictionEndDate, predictionSubSkill])

  const handleNext = () => {
    if (stepValid) setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  const handleBack = () => setStep((s) => Math.max(0, s - 1))

  const handleSubmit = async () => {
    setSaving(true)
    setSubmitError(null)
    try {
      const result: PreCommitmentWizardResult = {
        action: {
          type,
          ticker: ticker.trim(),
          company_name: companyName.trim(),
          action_date: actionDate,
          price: price.trim(),
          currency: currency.trim() || 'USD',
          shares: shares === '' ? null : shares,
          reason: thesis.trim(),
          notes: notesMarkdown,
          kill_criteria: killConditions.trim(),
          pre_mortem_text: infoEdge.trim(),
        },
        prediction: predictionLabel.trim()
          ? {
              label: predictionLabel.trim(),
              probability: predictionProbability,
              end_date: predictionEndDate,
              sub_skill: predictionSubSkill,
            }
          : null,
      }
      await onSubmit(result)
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Step bodies ----------

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Decision type</InputLabel>
              <Select value={type} label="Decision type" onChange={(e) => setType(e.target.value as 'buy' | 'add_more')}>
                <MenuItem value="buy">Buy (new position)</MenuItem>
                <MenuItem value="add_more">Add more (existing position)</MenuItem>
              </Select>
            </FormControl>
            <TickerAutocomplete
              value={ticker}
              onChange={setTicker}
              label="Ticker"
              placeholder="$SYMBOL or type company/symbol"
              size="small"
              onSelectResult={handleTickerSelect}
            />
            <TextField
              size="small"
              label="Decision date"
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 0, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                    <CalendarTodayIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                      <AttachMoneyIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                size="small"
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                sx={{ width: 90 }}
              />
            </Box>
            <TextField
              size="small"
              label="Shares (optional)"
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value === '' ? '' : Number(e.target.value))}
              inputProps={{ min: 0, step: 1 }}
            />
          </Stack>
        )

      case 1:
        return (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
              State your thesis in plain language. <strong>Minimum {MIN_THESIS_WORDS} words</strong> — forces you to be specific about
              what you actually believe before you put money down. (R3 + R9)
            </Alert>
            <ReasonField
              value={thesis}
              onChange={setThesis}
              label="Thesis"
              placeholder="What is the business doing that the market is missing? Be specific."
              size="small"
              fullWidth
              showManagePresets={false}
            />
            <TextField
              size="small"
              label="Full thesis (markdown)"
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Expand on the reason. Be specific enough that you could rebuild this decision from the text alone."
              multiline
              minRows={5}
              fullWidth
              helperText={`${wordCount(thesis)} / ${MIN_THESIS_WORDS} words minimum`}
              FormHelperTextProps={{
                sx: { color: wordCount(thesis) >= MIN_THESIS_WORDS ? 'success.main' : 'text.secondary' },
              }}
            />
          </Stack>
        )

      case 2:
        return (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
              Top 3 risks with rough probabilities. Later you'll score which risks actually materialized — that's how risk identification becomes a trainable sub-skill. (R7-Risk Identification)
            </Alert>
            {risks.map((r, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                <Box display="flex" alignItems="baseline" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Risk #{i + 1}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ~{r.probability}% likely
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  value={r.text}
                  onChange={(e) => {
                    const next = [...risks]
                    next[i] = { ...next[i], text: e.target.value }
                    setRisks(next)
                  }}
                  placeholder="e.g. Competitor ships at Q3 earnings"
                  fullWidth
                  sx={{ mb: 1 }}
                />
                <Slider
                  value={r.probability}
                  onChange={(_, v) => {
                    const next = [...risks]
                    next[i] = { ...next[i], probability: v as number }
                    setRisks(next)
                  }}
                  min={0}
                  max={100}
                  step={5}
                  size="small"
                />
              </Paper>
            ))}
          </Stack>
        )

      case 3:
        return (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
              What specifically will force a repricing, and by when? This trains the catalyst-timing sub-skill. (R4-Catalyst Timing)
            </Alert>
            {catalysts.map((c, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                <Box display="flex" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Catalyst #{i + 1}
                  </Typography>
                  {catalysts.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => setCatalysts(catalysts.filter((_, j) => j !== i))}
                      aria-label="Remove catalyst"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <TextField
                  size="small"
                  value={c.text}
                  onChange={(e) => {
                    const next = [...catalysts]
                    next[i] = { ...next[i], text: e.target.value }
                    setCatalysts(next)
                  }}
                  placeholder="e.g. Q3 earnings (margin expansion)"
                  fullWidth
                  sx={{ mb: 1 }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Expected by"
                  value={c.expected_date}
                  onChange={(e) => {
                    const next = [...catalysts]
                    next[i] = { ...next[i], expected_date: e.target.value }
                    setCatalysts(next)
                  }}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Paper>
            ))}
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => setCatalysts([...catalysts, { text: '', expected_date: daysAhead(90) }])}
              size="small"
              sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
            >
              Add another catalyst
            </Button>
          </Stack>
        )

      case 4:
        return (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
              One sub-prediction that resolves <strong>faster than the full thesis</strong>. This is R2 — creates a feedback loop you can actually learn from. Choose a sub-skill so this prediction contributes to your per-sub-skill Brier score (R7).
            </Alert>
            <TextField
              size="small"
              label="Prediction statement"
              value={predictionLabel}
              onChange={(e) => setPredictionLabel(e.target.value)}
              placeholder="e.g. Gross margin expands 200bps by Q3"
              multiline
              minRows={2}
              fullWidth
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Confidence (%)
              </Typography>
              <Slider
                value={predictionProbability}
                onChange={(_, v) => setPredictionProbability(v as number)}
                min={50}
                max={100}
                step={5}
                marks={[
                  { value: 50, label: '50' },
                  { value: 75, label: '75' },
                  { value: 100, label: '100' },
                ]}
                valueLabelDisplay="on"
              />
            </Box>
            <TextField
              size="small"
              label="Resolves by"
              type="date"
              value={predictionEndDate}
              onChange={(e) => setPredictionEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Sub-skill being trained</InputLabel>
              <Select
                value={predictionSubSkill}
                label="Sub-skill being trained"
                onChange={(e) => setPredictionSubSkill(e.target.value as SubSkill)}
              >
                {SUB_SKILLS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {SUB_SKILL_LABELS[s]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        )

      case 5:
        return (
          <Stack spacing={1.5}>
            <Alert severity="warning" icon={false} sx={{ fontSize: '0.8rem' }}>
              Pre-commit the exact conditions under which you will sell — price, time, news. If none trigger, you hold. If any trigger, you sell. No renegotiation in the moment. (R26)
            </Alert>
            <TextField
              size="small"
              label="Kill conditions"
              value={killConditions}
              onChange={(e) => setKillConditions(e.target.value)}
              placeholder={
                'If any of these happen I sell:\n- Stock trades below $42 (support broken)\n- Q3 revenue growth below 10%\n- CFO leaves\n- Still underwater on 2027-01-01 (time stop)'
              }
              multiline
              minRows={6}
              fullWidth
              helperText="One condition per line. The stricter you are here, the cleaner your sell discipline score will be."
            />
          </Stack>
        )

      case 6:
        return (
          <Stack spacing={1.5}>
            <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
              <strong>Information edge (R8):</strong> what do you know that the market doesn't, and why? Vague answers here are the strongest predictor of bad decisions. Minimum {MIN_INFO_EDGE_WORDS} words.
            </Alert>
            <TextField
              size="small"
              label='"What do I know that the market does not?"'
              value={infoEdge}
              onChange={(e) => setInfoEdge(e.target.value)}
              placeholder="Why is this mispriced? Who's on the other side of this trade, and why are they wrong? What specifically gives you an edge?"
              multiline
              minRows={5}
              fullWidth
              helperText={`${wordCount(infoEdge)} / ${MIN_INFO_EDGE_WORDS} words minimum`}
              FormHelperTextProps={{
                sx: { color: wordCount(infoEdge) >= MIN_INFO_EDGE_WORDS ? 'success.main' : 'text.secondary' },
              }}
            />
          </Stack>
        )

      case 7:
        return (
          <Stack spacing={1.5}>
            <Alert severity="success" icon={false} sx={{ fontSize: '0.8rem' }}>
              Every required field is set. Review below, then commit. The whole point of this flow is that the text you're about to save can be checked against reality later without hindsight bias intervening.
            </Alert>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {type === 'buy' ? 'BUY' : 'ADD MORE'} · {ticker || '—'} · {actionDate}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {shares ? `${shares} shares @ ${price} ${currency}` : `Price ${price} ${currency}`}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Thesis</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{thesis.trim()}</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Risks · Catalysts · Sub-prediction</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1, fontSize: '0.8rem' }}>{notesMarkdown}</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Kill conditions</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{killConditions.trim()}</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Information edge</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{infoEdge.trim()}</Typography>
            </Paper>
          </Stack>
        )

      default:
        return null
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth PaperProps={{ sx: { maxHeight: '95vh' } }}>
      <DialogTitle sx={{ pb: 1 }}>
        Pre-commitment wizard
        <Typography variant="caption" color="text.secondary" display="block">
          The stricter you are here, the more you can learn later.
        </Typography>
      </DialogTitle>
      <Box sx={{ px: 3, py: 1 }}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>
      <DialogContent dividers>
        {submitError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}
        {renderStep()}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="text" disabled={saving}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleBack} variant="outlined" disabled={step === 0 || saving}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} variant="contained" disabled={!stepValid || saving}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} variant="contained" color="success" disabled={saving}>
            {saving ? 'Saving…' : 'Commit decision'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
