import { useState, useEffect } from 'react'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { getReasonPresets, setReasonPresets } from '../utils/reasonPresets'
import type { ReasonPreset } from '../utils/reasonPresets'

interface ManageReasonPresetsDialogProps {
  open: boolean
  onClose: () => void
  onPresetsChange?: () => void
}

export default function ManageReasonPresetsDialog({
  open,
  onClose,
  onPresetsChange,
}: ManageReasonPresetsDialogProps) {
  const [presets, setPresets] = useState<ReasonPreset[]>([])
  const [newReason, setNewReason] = useState('')
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  useEffect(() => {
    if (open) setPresets(getReasonPresets())
  }, [open])

  const handleAdd = () => {
    const r = newReason.trim()
    if (!r || presets.some((p) => p.label === r)) return
    const next = [...presets, { label: r }].sort((a, b) => a.label.localeCompare(b.label))
    setPresets(next)
    setReasonPresets(next)
    setNewReason('')
    onPresetsChange?.()
  }

  const handleRemove = (label: string) => {
    const next = presets.filter((p) => p.label !== label)
    setPresets(next)
    setReasonPresets(next)
    onPresetsChange?.()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Manage reason presets</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          These appear at the top of the reason dropdown when adding a decision. You can still type any reason.
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
          <TextField
            size="small"
            placeholder="Add a reason (e.g. Cheap, Price drop)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            fullWidth
          />
          <Button variant="outlined" onClick={handleAdd} disabled={!newReason.trim()}>
            Add
          </Button>
        </Box>
        <List dense disablePadding>
          {presets.length === 0 ? (
            <ListItem>
              <ListItemText primary="No presets yet. Add one above." secondary="They’ll show in the decision reason dropdown." />
            </ListItem>
          ) : (
            presets.map((p) => (
              <ListItem
                key={p.label}
                secondaryAction={
                  <IconButton edge="end" aria-label="Remove" onClick={() => handleRemove(p.label)} size="small">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText primary={p.label} />
              </ListItem>
            ))
          )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
