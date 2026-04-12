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
} from '@mui/material'
import BottomSheet from './BottomSheet'
import type { EntryPrediction } from '../types/database'
import TickerAutocomplete from './TickerAutocomplete'
import { SUB_SKILLS, SUB_SKILL_LABELS, SUB_SKILL_DESCRIPTIONS } from '../types/subSkills'
import type { SubSkill } from '../types/subSkills'

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
  const [subSkill, setSubSkill] = useState<SubSkill | ''>((initial?.sub_skill as SubSkill | undefined) ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setProbability(initial?.probability ?? 50)
      setEndDate(initial?.end_date ?? getToday())
      setType(initial?.type ?? 'price')
      setLabel(initial?.label ?? '')
      setTicker(initial?.ticker ?? '')
      setSubSkill((initial?.sub_skill as SubSkill | undefined) ?? '')
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
        sub_skill: subSkill || null,
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
          <TextField
            size="small"
            label="Probability (%)"
            type="number"
            inputProps={{ min: 0, max: 100 }}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value) || 0)}
            fullWidth
          />
          <TextField
            size="small"
            label="End date"
            type="date"
            value={end_date}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
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
          <FormControl size="small" fullWidth>
            <InputLabel>Sub-skill being trained</InputLabel>
            <Select
              value={subSkill}
              label="Sub-skill being trained"
              onChange={(e) => setSubSkill(e.target.value as SubSkill | '')}
            >
              <MenuItem value="">
                <em>None (uncategorized)</em>
              </MenuItem>
              {SUB_SKILLS.map((s) => (
                <MenuItem key={s} value={s}>
                  <Box>
                    <Box component="span" sx={{ fontWeight: 600 }}>{SUB_SKILL_LABELS[s]}</Box>
                    <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: 'text.secondary' }}>
                      {SUB_SKILL_DESCRIPTIONS[s]}
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Label (optional)"
            placeholder="e.g. Better than even"
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
