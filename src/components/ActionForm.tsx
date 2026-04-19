/**
 * ActionForm — the full "log a decision" form, refactored from a modal
 * (BottomSheet-wrapped Dialog) into a plain in-page component. Used by
 * `DecisionFormPage` at routes `/decisions/new` and
 * `/decisions/:id/edit`. The route-level page handles navigation, data
 * fetch (for edit), and createAction / updateAction calls — this
 * component just renders the form and emits an `onSubmit` payload.
 *
 * Why no longer a dialog: the form is substantial (10+ fields,
 * collapses, option-symbol composer, ready-to-commit checklist) and
 * deserves its own context. Routing it also gives the user a real
 * URL they can bookmark / share / hit Back on.
 *
 * Cancel calls `onCancel` so the host page can navigate away
 * appropriately (back to the previous route, or to /actions as a
 * sensible default).
 */
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
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
import { getCustomDecisionTypes } from '../utils/customDecisionTypes'

interface ActionFormProps {
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
  /** Called when the user clicks Cancel. Page-level host navigates back. */
  onCancel: () => void
  /** When set, form pre-fills + submit button reads "Save". When null,
   *  empty form + "Add". */
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

export default function ActionForm({
  onSubmit,
  onCancel,
  initial,
}: ActionFormProps) {
  // `open` no longer exists (no modal). Effects that previously fired
  // on open are now driven by `initial` changing — they only run once
  // on mount in practice since the host page re-mounts the component
  // between routes.
  const open = true
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
  const [readyCheckOpen, setReadyCheckOpen] = useState(false)
  // Notes / Kill criteria / Pre-mortem each get their own collapse now.
  // Auto-open if the field already has content so editing existing rows
  // doesn't hide anything.
  const [notesOpen, setNotesOpen] = useState(Boolean(initial?.notes))
  const [killOpen, setKillOpen] = useState(Boolean((initial as { kill_criteria?: string })?.kill_criteria))
  const [premortemOpen, setPremortemOpen] = useState(Boolean((initial as { pre_mortem_text?: string | null })?.pre_mortem_text))
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
    setNotesOpen(Boolean(initial?.notes))
    setKillOpen(Boolean((initial as { kill_criteria?: string })?.kill_criteria))
    setPremortemOpen(Boolean((initial as { pre_mortem_text?: string | null })?.pre_mortem_text))
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
      // Host page navigates after a successful submit. Nothing to do
      // here — the form stays mounted briefly while the route changes.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save action')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <form onSubmit={handleSubmit}>
        <Box>
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

            {/* Notes, Kill criteria, Pre-mortem — each its own expandable
                card. Header shows "+" or "−" + the field name; when the
                field has content the card stays open on re-open. Matches
                the Price / Size / "Decision taken today" disclosures above
                so the whole dialog speaks one UI vocabulary. */}
            <Box>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setNotesOpen((v) => !v)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}
              >
                {notesOpen ? '−' : '+'} Notes
                {notes && !notesOpen && (
                  <Typography component="span" variant="caption" color="text.primary" sx={{ ml: 0.25, fontStyle: 'italic' }}>
                    · {notes.slice(0, 40)}{notes.length > 40 ? '…' : ''}
                  </Typography>
                )}
              </Link>
              <Collapse in={notesOpen} unmountOnExit>
                <TextField
                  size="small"
                  fullWidth
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  minRows={2}
                  sx={{ mt: 1 }}
                />
              </Collapse>
            </Box>

            <Box>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setKillOpen((v) => !v)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}
              >
                {killOpen ? '−' : '+'} Kill criteria
                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.25, fontWeight: 400 }}>
                  — if [X], reassess or sell
                </Typography>
              </Link>
              <Collapse in={killOpen} unmountOnExit>
                <TextField
                  size="small"
                  fullWidth
                  label="Kill criteria"
                  value={kill_criteria}
                  onChange={(e) => setKillCriteria(e.target.value)}
                  placeholder="If thesis breaks or stop hits, close the position"
                  multiline
                  minRows={2}
                  sx={{ mt: 1 }}
                />
              </Collapse>
            </Box>

            <Box>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setPremortemOpen((v) => !v)}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}
              >
                {premortemOpen ? '−' : '+'} Pre-mortem
                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.25, fontWeight: 400 }}>
                  — assume it fails, why?
                </Typography>
              </Link>
              <Collapse in={premortemOpen} unmountOnExit>
                <TextField
                  size="small"
                  fullWidth
                  label="Pre-mortem"
                  value={pre_mortem_text}
                  onChange={(e) => setPreMortemText(e.target.value)}
                  placeholder="If this decision fails in 2 years, what went wrong?"
                  multiline
                  minRows={2}
                  sx={{ mt: 1 }}
                />
              </Collapse>
            </Box>
          </Stack>
        </Box>
        {/* Sticky save bar — same pattern as EntryFormPage so the
            primary action stays reachable even after a long form. */}
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
            {saving ? 'Saving…' : initial?.id ? 'Save' : 'Add'}
          </Button>
        </Box>
      </form>
    </Box>
  )
}
