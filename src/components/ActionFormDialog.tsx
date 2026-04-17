import { useState, useRef, useEffect } from 'react'
// useTheme/useMediaQuery removed — BottomSheet handles mobile detection
import {
  Alert,
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
  Collapse,
  Typography,
  InputAdornment,
  Divider,
  Stack,
  FormControlLabel,
  Checkbox,
  Link,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CheckIcon from '@mui/icons-material/Check'
import { ACTION_TYPES, ACTION_SIZES, isDirectionalAction } from '../types/database'
import type { Action, ActionSize } from '../types/database'
import TickerAutocomplete from './TickerAutocomplete'
import DecisionChip from './DecisionChip'
import ReasonField from './ReasonField'
import BottomSheet from './BottomSheet'
import { getCustomDecisionTypes } from '../utils/customDecisionTypes'

interface ActionFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    type: Action['type']
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
    size: ActionSize | null
  }) => Promise<void>
  initial?: Partial<Action> | null
}

const getToday = () => new Date().toISOString().slice(0, 10)

/** Convert YYYY-MM-DD to DDMMMYY format for option tickers (e.g., 2027-01-15 → 15JAN27) */
function formatOptionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const day = String(d.getDate()).padStart(2, '0')
  const mon = months[d.getMonth()]
  const year = String(d.getFullYear()).slice(2)
  return `${day}${mon}${year}`
}

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function ActionFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: ActionFormDialogProps) {
  const [type, setType] = useState<Action['type']>(initial?.type ?? 'buy')
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [company_name, setCompanyName] = useState(initial?.company_name ?? '')
  const [action_date, setActionDate] = useState(initial?.action_date ?? getToday())
  const [price, setPrice] = useState(initial?.price ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [shares, setShares] = useState<number | ''>(initial?.shares ?? '')
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [kill_criteria, setKillCriteria] = useState((initial as { kill_criteria?: string })?.kill_criteria ?? '')
  const [pre_mortem_text, setPreMortemText] = useState((initial as { pre_mortem_text?: string | null })?.pre_mortem_text ?? '')
  const [size, setSize] = useState<ActionSize>((initial?.size as ActionSize) ?? 'medium')
  const [isOption, setIsOption] = useState(false)
  const [optionExpiry, setOptionExpiry] = useState('')
  const [optionStrike, setOptionStrike] = useState('')
  const [optionType, setOptionType] = useState<'C' | 'P'>('C')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [readyCheckOpen, setReadyCheckOpen] = useState(false)
  // Collapsed-by-default sections. When editing an existing row, open the
  // sections that already have a value so nothing is hidden.
  const initiallyTakenToday = (initial?.action_date ?? getToday()) === getToday()
  const [decisionTakenToday, setDecisionTakenToday] = useState(initiallyTakenToday)
  const [priceOpen, setPriceOpen] = useState(Boolean(initial?.price || initial?.currency || initial?.shares))
  const [sizeOpen, setSizeOpen] = useState(false)
  const tickerInputRef = useRef<HTMLInputElement>(null)
  const customTypes = getCustomDecisionTypes()

  useEffect(() => {
    if (open && tickerInputRef.current) {
      setTimeout(() => tickerInputRef.current?.focus(), 100)
    }
  }, [open])

  // Keep action_date pinned to today while "taken today" is checked.
  useEffect(() => {
    if (decisionTakenToday) setActionDate(getToday())
  }, [decisionTakenToday])

  // Sync form state with `initial` whenever the dialog is (re-)opened. The
  // useState defaults only fire once on mount, so re-opening with a different
  // action would otherwise leave stale values from the previous open.
  useEffect(() => {
    if (!open) return
    setType((initial?.type as Action['type']) ?? 'buy')
    setTicker(initial?.ticker ?? '')
    setCompanyName(initial?.company_name ?? '')
    setActionDate(initial?.action_date ?? getToday())
    setPrice(initial?.price ?? '')
    setCurrency(initial?.currency ?? '')
    setShares(initial?.shares ?? '')
    setReason(initial?.reason ?? '')
    setNotes(initial?.notes ?? '')
    setKillCriteria((initial as { kill_criteria?: string })?.kill_criteria ?? '')
    setPreMortemText((initial as { pre_mortem_text?: string | null })?.pre_mortem_text ?? '')
    setSize((initial?.size as ActionSize) ?? 'medium')
    const takenToday = (initial?.action_date ?? getToday()) === getToday()
    setDecisionTakenToday(takenToday)
    setPriceOpen(Boolean(initial?.price || initial?.currency || initial?.shares))
    setSizeOpen(false)
  }, [open, initial])

  const isNewBuy = !initial?.id && type === 'buy'
  const readyChecks = {
    thesis: reason.trim().length > 0,
    kill: kill_criteria.trim().length > 0,
    premortem: pre_mortem_text.trim().length > 0,
  }

  const handleTickerSelect = async (r: { symbol: string; name: string }) => {
    setCompanyName(r.name)
    setTicker(r.symbol)
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(r.symbol)}`)
      if (res.ok) {
        const data = await res.json() as { price?: number; currency?: string }
        if (data.price) setPrice(String(data.price))
        if (data.currency) setCurrency(data.currency)
      }
    } catch {
      // user can type manually
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticker.trim()) {
      setError('Ticker is required.')
      return
    }
    if ((type === 'buy' || type === 'add_more') && !reason.trim()) {
      setError('Reason is required for Buy decisions.')
      return
    }
    setError(null)
    setSaving(true)
    // Compose option ticker: "AAPL 15JAN27 200 C"
    const effectiveTicker = isOption && optionExpiry && optionStrike
      ? `${ticker.trim()} ${formatOptionDate(optionExpiry)} ${optionStrike.trim()} ${optionType}`
      : ticker.trim()
    try {
      await onSubmit({
        type,
        ticker: effectiveTicker,
        company_name: company_name || '',
        action_date,
        price,
        currency,
        shares: shares === '' ? null : shares,
        reason,
        notes,
        kill_criteria: kill_criteria || '',
        pre_mortem_text: pre_mortem_text || '',
        size: isDirectionalAction(type) ? size : null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle>{initial?.id ? 'Edit action' : 'Add action'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Type + Ticker on one row — both are required and the section
                was taking two full rows with redundant sub-captions. The
                inputs carry their own labels; no subtitle needed. */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={type}
                  label="Type"
                  onChange={(e) => setType(e.target.value as Action['type'])}
                  renderValue={(v) => <DecisionChip type={v} size="small" sx={{ pointerEvents: 'none' }} />}
                >
                  {ACTION_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      <DecisionChip type={t} size="small" sx={{ pointerEvents: 'none' }} />
                    </MenuItem>
                  ))}
                  {customTypes.length > 0 && [
                    <Divider key="div" />,
                    ...customTypes.map((ct) => (
                      <MenuItem key={ct.id} value={ct.id as Action['type']}>
                        <DecisionChip type={ct.id} size="small" sx={{ pointerEvents: 'none' }} />
                      </MenuItem>
                    )),
                  ]}
                </Select>
              </FormControl>
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <TickerAutocomplete
                  value={ticker}
                  onChange={setTicker}
                  label="Ticker"
                  placeholder="$SYMBOL or company name"
                  size="small"
                  onSelectResult={handleTickerSelect}
                />
              </Box>
            </Box>

            <Box>
              <FormControlLabel
                control={<Checkbox size="small" checked={isOption} onChange={(_, v) => setIsOption(v)} />}
                label={<Typography variant="caption">This is an option</Typography>}
                sx={{ ml: -0.75 }}
              />
              {isOption && (
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <TextField
                    size="small"
                    label="Expiry"
                    type="date"
                    value={optionExpiry}
                    onChange={(e) => setOptionExpiry(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Strike"
                    value={optionStrike}
                    onChange={(e) => setOptionStrike(e.target.value)}
                    placeholder="200"
                    sx={{ width: 80 }}
                  />
                  <FormControl size="small" sx={{ width: 70 }}>
                    <InputLabel>C/P</InputLabel>
                    <Select value={optionType} label="C/P" onChange={(e) => setOptionType(e.target.value as 'C' | 'P')}>
                      <MenuItem value="C">Call</MenuItem>
                      <MenuItem value="P">Put</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>

            {/* Date — defaults to "today" checkbox. Uncheck to reveal the date
                picker + quick-pick buttons. Mirrors the entry form dialog. */}
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={decisionTakenToday}
                    onChange={(e) => setDecisionTakenToday(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Decision taken today</Typography>}
                sx={{ ml: -0.75 }}
              />
              <Collapse in={!decisionTakenToday} unmountOnExit>
                <Box sx={{ mt: 0.5 }}>
                  <TextField
                    size="small"
                    label="Decision date"
                    type="date"
                    value={action_date}
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
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Yesterday', fn: () => daysAgo(1) },
                      { label: '1 week ago', fn: () => daysAgo(7) },
                      { label: '2 weeks ago', fn: () => daysAgo(14) },
                      { label: '1 month ago', fn: () => daysAgo(30) },
                    ].map(({ label, fn }) => (
                      <Button key={label} size="small" variant="outlined" onClick={() => setActionDate(fn())} sx={{ textTransform: 'none' }}>
                        {label}
                      </Button>
                    ))}
                  </Box>
                </Box>
              </Collapse>
            </Box>

            {/* Price / Currency / Shares — collapsed link. Open if the user is
                editing a row that already has any of them. */}
            <Box>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setPriceOpen((v) => !v)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: '0.85rem', color: 'text.secondary' }}
              >
                {priceOpen ? '− ' : '+ '}
                {priceOpen ? 'Hide price, currency, shares' : 'Add price, currency, shares'}
              </Link>
              <Collapse in={priceOpen} unmountOnExit>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label="Price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    sx={{ flex: '1 1 120px', minWidth: 120 }}
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
                    label="Cur."
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    sx={{ width: 90 }}
                    inputProps={{ maxLength: 4 }}
                  />
                  <TextField
                    size="small"
                    label="Shares"
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(e.target.value === '' ? '' : Number(e.target.value))}
                    inputProps={{ min: 0, step: 1 }}
                    sx={{ width: 110 }}
                  />
                </Box>
              </Collapse>
            </Box>

            {/* Size — collapsed. Header shows the current choice so the user
                knows what's in effect without opening it. Only rendered for
                directional types (buys, sells, etc). */}
            {isDirectionalAction(type) && (
              <Box>
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() => setSizeOpen((v) => !v)}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}
                >
                  {sizeOpen ? '− Size' : '+ Size'}
                  <Typography component="span" variant="caption" color="text.primary" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                    · {size === 'xl' ? 'Very big' : size}
                  </Typography>
                </Link>
                <Collapse in={sizeOpen} unmountOnExit>
                  <Box sx={{ mt: 0.75 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: '0.72rem' }}>
                      Scales the glow on the timeline.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {ACTION_SIZES.map((s) => {
                        const selected = size === s
                        return (
                          <Button
                            key={s}
                            size="small"
                            variant={selected ? 'contained' : 'outlined'}
                            onClick={() => setSize(s)}
                            sx={{
                              textTransform: 'none',
                              minWidth: 0,
                              px: 1.25,
                              py: 0.25,
                              fontSize: '0.75rem',
                              fontWeight: selected ? 700 : 500,
                            }}
                          >
                            {s === 'tiny' ? 'Tiny' : s === 'small' ? 'Small' : s === 'medium' ? 'Medium' : s === 'large' ? 'Large' : 'Very big'}
                          </Button>
                        )
                      })}
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            )}

            <ReasonField
              value={reason}
              onChange={setReason}
              label="Reason"
              placeholder="e.g. Cheap, Too expensive, or pick / type"
              size="small"
              fullWidth
              showManagePresets
            />

            {isNewBuy && (
              <Box>
                <Button size="small" variant="text" onClick={() => setReadyCheckOpen((o) => !o)} sx={{ textTransform: 'none', p: 0, minHeight: 0 }}>
                  {readyCheckOpen ? 'Hide' : 'Show'} "Ready to commit?" checklist
                </Button>
                <Collapse in={readyCheckOpen}>
                  <Box sx={{ mt: 1, p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Before you commit
                    </Typography>
                    {[
                      { done: readyChecks.thesis, text: 'Thesis / reason (and evidence that would prove me wrong)' },
                      { done: readyChecks.kill, text: 'Kill criteria set ("If [X], I reassess or sell")' },
                      { done: readyChecks.premortem, text: 'Pre-mortem done ("If this fails in 2 years, what went wrong?")' },
                    ].map(({ done, text }) => (
                      <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25 }}>
                        {done ? <CheckCircleOutlineIcon fontSize="small" color="success" /> : <RadioButtonUncheckedIcon fontSize="small" color="action" />}
                        <Typography variant="body2">{text}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            )}

            <Box>
              <Button
                size="small"
                onClick={() => setAdvancedOpen((o) => !o)}
                sx={{ p: 0, minHeight: 0, textTransform: 'none', color: 'text.secondary' }}
              >
                {advancedOpen ? 'Hide' : 'Show'} optional fields (notes, kill criteria, pre-mortem)
              </Button>
              <Collapse in={advancedOpen}>
                <Stack spacing={2} sx={{ pt: 1.5 }}>
                  <TextField
                    size="small"
                    label="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    multiline
                    minRows={2}
                  />
                  <TextField
                    size="small"
                    label="Kill criteria (optional)"
                    value={kill_criteria}
                    onChange={(e) => setKillCriteria(e.target.value)}
                    placeholder="If [X], I reassess or sell"
                    helperText="Pre-commit exit conditions"
                    multiline
                    minRows={1}
                  />
                  <TextField
                    size="small"
                    label="Pre-mortem (optional)"
                    value={pre_mortem_text}
                    onChange={(e) => setPreMortemText(e.target.value)}
                    placeholder="If this decision fails, what is the most likely reason?"
                    helperText="Assume it fails — why?"
                    multiline
                    minRows={2}
                  />
                </Stack>
              </Collapse>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={!saving ? <CheckIcon /> : null}>
            {saving ? 'Saving…' : initial?.id ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </BottomSheet>
  )
}
