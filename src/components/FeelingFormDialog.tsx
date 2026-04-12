import { useState, useEffect } from 'react'
import {
  Dialog,
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
import type { EntryFeeling, FeelingType } from '../types/database'

const FEELING_TYPES: FeelingType[] = ['idea', 'market']

interface FeelingFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: { score: number; label: string; type: FeelingType; ticker: string }) => Promise<void>
  initial?: EntryFeeling | null
}

export default function FeelingFormDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: FeelingFormDialogProps) {
  const [score, setScore] = useState(initial?.score ?? 5)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<FeelingType>(initial?.type ?? 'idea')
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setScore(initial?.score ?? 5)
      setLabel(initial?.label ?? '')
      setType(initial?.type ?? 'idea')
      setTicker(initial?.ticker ?? '')
    }
  }, [open, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        score: Math.max(1, Math.min(10, score)),
        label: label.trim() || '',
        type,
        ticker: ticker.trim() || '',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial?.id ? 'Edit feeling' : 'Add feeling'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            size="small"
            label="Score (1–10)"
            type="number"
            inputProps={{ min: 1, max: 10 }}
            value={score}
            onChange={(e) => setScore(Number(e.target.value) || 5)}
            fullWidth
          />
          <TextField
            size="small"
            label="Label (optional)"
            placeholder="e.g. Great, Poor, Neutral"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Type</InputLabel>
            <Select value={type} label="Type" onChange={(e) => setType(e.target.value as FeelingType)}>
              {FEELING_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Ticker (optional)"
            placeholder="e.g. GLD, SPX"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
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
    </Dialog>
  )
}
