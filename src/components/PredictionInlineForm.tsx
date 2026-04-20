/**
 * Prediction inline form — renders directly inside the host page (no
 * modal). Used by `EntryDetailPage`'s Predictions tab.
 *
 * Used to be `PredictionFormDialog` wrapped in a `BottomSheet`. The
 * dialog form factor was unnecessary — predictions are always added
 * from inside an entry detail view, never from a global "log
 * prediction" entry point, so there's no reason to overlay the page.
 * Inlining the form means the user sees the predictions list AND the
 * add form on the same screen.
 *
 * Same field set + the same `onSubmit` payload as before so the host
 * page's submit handler doesn't change.
 */

import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  TextField,
  Typography,
} from '@mui/material'
import type { EntryPrediction } from '../types/database'
import { todayISO } from '../utils/dates'
import TickerAutocomplete from './TickerAutocomplete'

const PREDICTION_TYPES = ['price', 'revenue', 'margin', 'other'] as const

interface PredictionInlineFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    probability: number
    end_date: string
    type: string
    label: string
    ticker: string
    sub_skill: string | null
  }) => Promise<void>
  initial?: EntryPrediction | null
}

const getToday = todayISO

function probabilityLabel(p: number): string {
  if (p <= 10) return 'Very unlikely'
  if (p <= 30) return 'Unlikely'
  if (p < 50) return 'Slight no'
  if (p === 50) return 'Coin flip'
  if (p < 70) return 'Slight yes'
  if (p < 90) return 'Likely'
  return 'Very likely'
}

export default function PredictionInlineForm({
  open,
  onClose,
  onSubmit,
  initial,
}: PredictionInlineFormProps) {
  const [probability, setProbability] = useState(initial?.probability ?? 50)
  const [end_date, setEndDate] = useState(initial?.end_date ?? getToday())
  const [type, setType] = useState(initial?.type ?? 'price')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setProbability(initial?.probability ?? 50)
      setEndDate(initial?.end_date ?? getToday())
      setType(initial?.type ?? 'price')
      setLabel(initial?.label ?? '')
      setTicker(initial?.ticker ?? '')
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        probability: Math.max(0, Math.min(100, probability)),
        end_date,
        type,
        label: label.trim() || '',
        ticker: ticker.trim() || '',
        // Always null — `sub_skill` UI was retired with the Practice
        // page; the schema field stays so historical rows aren't
        // disturbed.
        sub_skill: null,
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.25, sm: 1.5 },
        mb: 1.5,
        borderColor: 'primary.light',
        borderWidth: 1.5,
        borderRadius: 1.5,
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        {initial?.id ? 'Edit prediction' : 'Add prediction'}
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Probability — slider + live label. Same UX as the modal
            version but the form lives in-page now. */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Typography variant="body2" fontWeight={600}>Probability</Typography>
            <Typography variant="caption" color="text.secondary">
              {probability}% &middot; {probabilityLabel(probability)}
            </Typography>
          </Box>
          <Slider
            value={probability}
            onChange={(_, v) => setProbability(v as number)}
            min={0}
            max={100}
            step={5}
            marks={[
              { value: 0, label: '0' },
              { value: 25, label: '25' },
              { value: 50, label: '50' },
              { value: 75, label: '75' },
              { value: 100, label: '100' },
            ]}
            size="small"
            sx={{ mt: 1 }}
          />
        </Box>

        <TextField
          size="small"
          label="By date"
          type="date"
          value={end_date}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
          helperText="When should this be checked? Past this date the prediction is resolvable."
        />

        <FormControl size="small" fullWidth>
          <InputLabel>Type</InputLabel>
          <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
            {PREDICTION_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Label (optional)"
          placeholder="e.g. EPS beats consensus"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          fullWidth
        />

        <TickerAutocomplete
          value={ticker}
          onChange={setTicker}
          label="Ticker (optional)"
          placeholder="$SYMBOL or type company/symbol to search"
          size="small"
          fullWidth
        />

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 0.5 }}>
          <Button onClick={onClose} variant="outlined" size="small">Cancel</Button>
          <Button type="submit" variant="contained" size="small" disabled={saving}>
            {initial?.id ? 'Save' : 'Add'}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
