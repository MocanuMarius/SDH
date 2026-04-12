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
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface AddReminderDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (reminderDate: string, note: string) => Promise<void>
  entryTitle?: string
}

export default function AddReminderDialog({ open, onClose, onSubmit, entryTitle }: AddReminderDialogProps) {
  const [reminderDate, setReminderDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSubmit(reminderDate, note.trim())
      setNote('')
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
        <TextField
          label="Remind me on"
          type="date"
          value={reminderDate}
          onChange={(e) => setReminderDate(e.target.value)}
          fullWidth
          margin="normal"
          size="small"
          InputLabelProps={{ shrink: true }}
        />
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
