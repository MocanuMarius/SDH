import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Box,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface AddReminderDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (reminderDate: string, note: string) => Promise<void>
  entryTitle?: string
}

const PRESETS: { label: string; days: number }[] = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: '2 years', days: 730 },
]

const DEFAULT_DAYS = 30

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function AddReminderDialog({ open, onClose, onSubmit, entryTitle }: AddReminderDialogProps) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSubmit(addDaysIso(days), note.trim())
      setNote('')
      setDays(DEFAULT_DAYS)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
        Add reminder
        <IconButton size="small" onClick={onClose} edge="end"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {entryTitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Entry: {entryTitle.slice(0, 60)}{entryTitle.length > 60 ? '…' : ''}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
          Remind me in
        </Typography>
        <ToggleButtonGroup
          value={days}
          exclusive
          onChange={(_, v) => { if (v !== null) setDays(v) }}
          size="small"
          sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { border: 1, borderColor: 'divider', borderRadius: 1, textTransform: 'none' } }}
        >
          {PRESETS.map((p) => (
            <ToggleButton key={p.days} value={p.days}>{p.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {addDaysIso(days)}
          </Typography>
        </Box>
        <TextField
          label="Note (optional)"
          placeholder="e.g. Revisit thesis, Check what happened"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          margin="normal"
          size="small"
          multiline
          minRows={2}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Adding…' : 'Add reminder'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
