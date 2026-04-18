import { useState, useEffect, useRef } from 'react'
import {
  Box,
  Typography,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Stack,
  InputAdornment,
  IconButton,
  Collapse,
  FormControlLabel,
  Checkbox,
  Link,
} from '@mui/material'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import BottomSheet from './BottomSheet'
import {
  buildDecisionBlockMarkdown,
  type DecisionBlockFields,
  type DecisionType,
} from '../utils/decisionBlockMarkdown'
import TickerAutocomplete from './TickerAutocomplete'
import DecisionChip from './DecisionChip'
import ReasonField from './ReasonField'
import { ACTION_TYPES, ACTION_SIZES, isDirectionalAction } from '../types/database'
import type { ActionSize } from '../types/database'
import { getCustomDecisionTypes } from '../utils/customDecisionTypes'

const getToday = () => new Date().toISOString().slice(0, 10)

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

interface InsertDecisionBlockDialogProps {
  open: boolean
  onClose: () => void
  onInsert: (markdown: string, block: DecisionBlockFields) => void
  /** When true, render form fields only (no dialog wrapper). Used for inline embedding. */
  inline?: boolean
  /** Pre-fill ticker (e.g. parsed from the entry title's $TICKER). */
  defaultTicker?: string
  /** Pre-fill company name. */
  defaultCompanyName?: string
}

export default function InsertDecisionBlockDialog({
  open,
  onClose,
  onInsert,
  inline = false,
  defaultTicker = '',
  defaultCompanyName = '',
}: InsertDecisionBlockDialogProps) {
  const [type, setType] = useState<string>('buy')
  const [ticker, setTicker] = useState(defaultTicker)
  const [company_name, setCompanyName] = useState(defaultCompanyName)
  // Track the last default we synced from so we only auto-fill when the parent
  // hands us a new default and the user hasn't typed something different.
  const lastDefaultTickerRef = useRef(defaultTicker)
  useEffect(() => {
    if (defaultTicker && defaultTicker !== lastDefaultTickerRef.current) {
      if (!ticker.trim() || ticker === lastDefaultTickerRef.current) {
        setTicker(defaultTicker)
      }
      lastDefaultTickerRef.current = defaultTicker
    }
  }, [defaultTicker, ticker])
  const lastDefaultCompanyRef = useRef(defaultCompanyName)
  useEffect(() => {
    if (defaultCompanyName && defaultCompanyName !== lastDefaultCompanyRef.current) {
      if (!company_name.trim() || company_name === lastDefaultCompanyRef.current) {
        setCompanyName(defaultCompanyName)
      }
      lastDefaultCompanyRef.current = defaultCompanyName
    }
  }, [defaultCompanyName, company_name])
  const [action_date, setActionDate] = useState(getToday())
  const [decisionToday, setDecisionToday] = useState(true)
  const [showOptionalDetails, setShowOptionalDetails] = useState(false)
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shares, setShares] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [size, setSize] = useState<ActionSize>('medium')
  const [sizeOpen, setSizeOpen] = useState(false)
  const customTypes = getCustomDecisionTypes()

  // Keep action_date glued to "today" while the "decision taken today" checkbox is on.
  useEffect(() => {
    if (decisionToday) setActionDate(getToday())
  }, [decisionToday])

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Stop React synthetic event bubbling: the dialog is often rendered inside
    // another <form> (EntryFormPage), and without this the outer form's
    // onSubmit fires alongside the dialog's — creating the entry before the
    // decision is added to pendingDecisions.
    e.stopPropagation()
    const block: DecisionBlockFields = {
      type: type as DecisionType,
      ticker: ticker.trim(),
      company_name: company_name.trim(),
      action_date,
      price: price.trim(),
      currency: currency.trim() || '$',
      shares: shares === '' ? null : shares,
      reason: reason.trim(),
      notes: notes.trim(),
      size: isDirectionalAction(type) ? size : null,
    }
    const markdown = buildDecisionBlockMarkdown(block)
    onInsert(markdown, block)
    onClose()
    setTicker('')
    setCompanyName('')
    setPrice('')
    setCurrency('USD')
    setShares('')
    setReason('')
    setNotes('')
    setActionDate(getToday())
    setDecisionToday(true)
    setShowOptionalDetails(false)
    setSize('medium')
    setSizeOpen(false)
    setType('buy')
  }

  const fields = (
    <Stack spacing={1.5} sx={{ pt: 0.5 }}>
      {/* Row 1: compact Type selector + dominant Ticker — equal heights */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          alignItems: 'flex-start',
          '& .MuiOutlinedInput-root': { minHeight: 40 },
          '& .MuiInputBase-input': { py: 0.5 },
        }}
      >
        <FormControl size="small" sx={{ width: 130, flexShrink: 0 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={type}
            label="Type"
            onChange={(e) => setType(e.target.value)}
            renderValue={(v) => <DecisionChip type={v} size="small" sx={{ pointerEvents: 'none' }} />}
            sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center', py: 0.5 } }}
          >
            {ACTION_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                <DecisionChip type={t} size="small" sx={{ pointerEvents: 'none' }} />
              </MenuItem>
            ))}
            {customTypes.length > 0 && [
              <Divider key="div" />,
              ...customTypes.map((ct) => (
                <MenuItem key={ct.id} value={ct.id}>
                  <DecisionChip type={ct.id} size="small" sx={{ pointerEvents: 'none' }} />
                </MenuItem>
              )),
            ]}
          </Select>
        </FormControl>

        <Box sx={{ flex: 1, minWidth: 0 }}>
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

      {/* Reason — primary field */}
      <ReasonField
        value={reason}
        onChange={setReason}
        label="Reason"
        placeholder="e.g. Cheap, Too expensive, or pick / type"
        size="small"
        fullWidth
        showManagePresets
      />

      {/* Notes — primary field */}
      <TextField
        size="small"
        label="Notes / expanded reasoning"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        minRows={2}
        fullWidth
      />

      {/* Size — collapsed, shows current choice in the header. Only
          meaningful for directional types. Matches ActionFormDialog. */}
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

      {/* Date — collapsed behind a checkbox; default is "today" */}
      <Box>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={decisionToday}
              onChange={(e) => setDecisionToday(e.target.checked)}
            />
          }
          label="Decision taken today"
          sx={{ ml: -0.75, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
        />
        <Collapse in={!decisionToday} unmountOnExit>
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

      {/* Optional details — price / currency / shares — hidden by default */}
      <Box>
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={() => setShowOptionalDetails((v) => !v)}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: '0.8rem', color: 'text.secondary' }}
        >
          {showOptionalDetails ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          {showOptionalDetails ? 'Hide price & shares' : 'Add price & shares'}
        </Link>
        <Collapse in={showOptionalDetails} unmountOnExit>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="75.40"
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
                placeholder="USD"
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
        </Collapse>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          type={inline ? 'button' : 'submit'}
          variant="contained"
          size="small"
          sx={{ flex: 1 }}
          onClick={inline ? (e) => handleSubmit(e as unknown as React.FormEvent) : undefined}
          disabled={!ticker.trim()}
        >
          Add decision
        </Button>
        {inline && (
          <Button onClick={onClose} variant="outlined" size="small">
            Cancel
          </Button>
        )}
      </Box>
    </Stack>
  )

  // Inline mode: render fields directly without dialog wrapper (no <form> to avoid nesting)
  if (inline) {
    return (
      <Box sx={{ p: 1.5 }}>
        {fields}
      </Box>
    )
  }

  // Dialog mode: wrap in BottomSheet
  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
        Add decision
        <IconButton size="small" onClick={onClose} edge="end"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {fields}
        </DialogContent>
      </form>
    </BottomSheet>
  )
}
