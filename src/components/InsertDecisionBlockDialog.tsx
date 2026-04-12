import { useState } from 'react'
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
  Divider,
  Stack,
  InputAdornment,
  IconButton,
} from '@mui/material'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CloseIcon from '@mui/icons-material/Close'
import BottomSheet from './BottomSheet'
import {
  buildDecisionBlockMarkdown,
  type DecisionBlockFields,
  type DecisionType,
} from '../utils/decisionBlockMarkdown'
import TickerAutocomplete from './TickerAutocomplete'
import DecisionChip from './DecisionChip'
import ReasonField from './ReasonField'
import { ACTION_TYPES } from '../types/database'
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
  onInsert: (markdown: string) => void
  /** When true, render form fields only (no dialog wrapper). Used for inline embedding. */
  inline?: boolean
}

export default function InsertDecisionBlockDialog({
  open,
  onClose,
  onInsert,
  inline = false,
}: InsertDecisionBlockDialogProps) {
  const [type, setType] = useState<string>('buy')
  const [ticker, setTicker] = useState('')
  const [company_name, setCompanyName] = useState('')
  const [action_date, setActionDate] = useState(getToday())
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shares, setShares] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const customTypes = getCustomDecisionTypes()

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
    }
    const markdown = buildDecisionBlockMarkdown(block)
    onInsert(markdown)
    onClose()
    setTicker('')
    setCompanyName('')
    setPrice('')
    setCurrency('USD')
    setShares('')
    setReason('')
    setNotes('')
    setActionDate(getToday())
    setType('buy')
  }

  const fields = (
    <Stack spacing={2} sx={{ pt: 0.5 }}>
      <FormControl size="small" fullWidth>
        <InputLabel>Type</InputLabel>
        <Select
          value={type}
          label="Type"
          onChange={(e) => setType(e.target.value)}
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
              <MenuItem key={ct.id} value={ct.id}>
                <DecisionChip type={ct.id} size="small" sx={{ pointerEvents: 'none' }} />
              </MenuItem>
            )),
          ]}
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

      <Box>
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
            { label: 'Today', fn: () => getToday() },
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

      <ReasonField
        value={reason}
        onChange={setReason}
        label="Reason"
        placeholder="e.g. Cheap, Too expensive, or pick / type"
        size="small"
        fullWidth
        showManagePresets
      />

      <TextField
        size="small"
        label="Notes / expanded reasoning"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        minRows={2}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          type={inline ? 'button' : 'submit'}
          variant="contained"
          size="small"
          sx={{ flex: 1 }}
          onClick={inline ? (e) => handleSubmit(e as unknown as React.FormEvent) : undefined}
        >
          Insert into body
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
        Insert decision block
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
