/**
 * Prediction dialog — log a probabilistic forecast attached to an
 * entry. Designed to be the same five-second flow as logging a
 * decision: pick a probability, set a by-date, type, optionally add a
 * label / ticker, save.
 *
 * Pre-redesign the dialog asked for a "Sub-skill being trained"
 * dropdown — leftover wiring from the now-retired Practice page that
 * grouped predictions by skill. Since the only consumer of that field
 * was the Practice/Brier page (deleted in audit item L-1), the
 * dropdown is gone here too. The `sub_skill` column on
 * `entry_predictions` stays in the DB so any historical rows aren't
 * lost; nothing in the app reads it now.
 *
 * Probability used to be a raw number TextField; now a Slider with
 * 5 % snap so the user can drag instead of typing.
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
  Slider,
  Typography,
} from '@mui/material'
import BottomSheet from './BottomSheet'
import type { EntryPrediction } from '../types/database'
import TickerAutocomplete from './TickerAutocomplete'

const PREDICTION_TYPES = ['price', 'revenue', 'margin', 'other'] as const

interface PredictionFormDialogProps {
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

const getToday = () => new Date().toISOString().slice(0, 10)

/** Confidence bands for the slider — gives the user a non-numeric
 *  cue ("I'm 75 % is leaning confident") without sacrificing the
 *  numeric input the calibration scoring needs. */
function probabilityLabel(p: number): string {
  if (p <= 10) return 'Very unlikely'
  if (p <= 30) return 'Unlikely'
  if (p < 50) return 'Slight no'
  if (p === 50) return 'Coin flip'
  if (p < 70) return 'Slight yes'
  if (p < 90) return 'Likely'
  return 'Very likely'
}

export default function PredictionFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: PredictionFormDialogProps) {
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
        // Always null — `sub_skill` UI is retired but the schema field
        // stays so historical rows aren't disturbed.
        sub_skill: null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle>{initial?.id ? 'Edit prediction' : 'Add prediction'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* Probability — slider + live label. 5 % snap so the user
              can drag accurately without typing. The live confidence
              wording reinforces what 75 % "feels like" without
              hiding the number the calibration math needs. */}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {initial?.id ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </BottomSheet>
  )
}
