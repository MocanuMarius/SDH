import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Reorder } from 'motion/react'
import { getReasonPresets, setReasonPresets, removeReasonPresetAtIndex, updateReasonPresetColor } from '../utils/reasonPresets'
import type { ReasonPreset } from '../utils/reasonPresets'
import { getTagPresets, setTagPresets, removeTagPresetAtIndex, updateTagPresetColor } from '../utils/tagPresets'
import type { TagPreset } from '../utils/tagPresets'
import {
  getCustomDecisionTypes,
  addCustomDecisionType,
  removeCustomDecisionType,
  updateCustomDecisionType,
} from '../utils/customDecisionTypes'
import type { CustomDecisionType } from '../utils/customDecisionTypes'
import TagChip from '../components/TagChip'
import DecisionChip from '../components/DecisionChip'
import { PageHeader } from '../components/system'

const DEFAULT_COLOR = '#6366f1'

function ColorSwatch({ color, onChange, label }: { color?: string; onChange: (c: string) => void; label: string }) {
  return (
    <Tooltip title={`Change color for "${label}"`}>
      <Box
        component="label"
        sx={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          bgcolor: color ?? '#e2e8f0',
          border: '2px solid',
          borderColor: color ? 'transparent' : 'divider',
          cursor: 'pointer',
          display: 'inline-flex',
          flexShrink: 0,
          overflow: 'hidden',
          '&:hover': { opacity: 0.8 },
        }}
      >
        <input
          type="color"
          value={color ?? '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
        />
      </Box>
    </Tooltip>
  )
}

export default function SettingsPage() {
  const [reasonPresets, setLocalReasonPresets] = useState<ReasonPreset[]>([])
  const [tagPresets, setLocalTagPresets] = useState<TagPreset[]>([])
  const [customTypes, setLocalCustomTypes] = useState<CustomDecisionType[]>([])

  const [newReasonDialogOpen, setNewReasonDialogOpen] = useState(false)
  const [newTagDialogOpen, setNewTagDialogOpen] = useState(false)
  const [newTypeDialogOpen, setNewTypeDialogOpen] = useState(false)

  const [newReason, setNewReason] = useState('')
  const [newTag, setNewTag] = useState('')
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [newTypeColor, setNewTypeColor] = useState(DEFAULT_COLOR)

  useEffect(() => {
    setLocalReasonPresets(getReasonPresets())
    setLocalTagPresets(getTagPresets())
    setLocalCustomTypes(getCustomDecisionTypes())
  }, [])

  // --- Reasons ---
  const handleAddReason = () => {
    if (!newReason.trim()) return
    const updated = [...reasonPresets, { label: newReason.trim() }]
    setReasonPresets(updated)
    setLocalReasonPresets(updated)
    setNewReason('')
    setNewReasonDialogOpen(false)
  }

  const handleRemoveReason = (index: number) => {
    removeReasonPresetAtIndex(index)
    setLocalReasonPresets((prev) => prev.filter((_, i) => i !== index))
  }

  const handleReasonColor = (label: string, color: string) => {
    updateReasonPresetColor(label, color)
    setLocalReasonPresets(getReasonPresets())
  }

  // --- Tags ---
  const handleAddTag = () => {
    if (!newTag.trim()) return
    const updated = [...tagPresets, { label: newTag.trim() }]
    setTagPresets(updated)
    setLocalTagPresets(updated)
    setNewTag('')
    setNewTagDialogOpen(false)
  }

  const handleRemoveTag = (index: number) => {
    removeTagPresetAtIndex(index)
    setLocalTagPresets((prev) => prev.filter((_, i) => i !== index))
  }

  const handleTagColor = (label: string, color: string) => {
    updateTagPresetColor(label, color)
    setLocalTagPresets(getTagPresets())
  }

  // --- Custom decision types ---
  const handleAddType = () => {
    if (!newTypeLabel.trim()) return
    addCustomDecisionType(newTypeLabel.trim(), newTypeColor)
    setLocalCustomTypes(getCustomDecisionTypes())
    setNewTypeLabel('')
    setNewTypeColor(DEFAULT_COLOR)
    setNewTypeDialogOpen(false)
  }

  const handleRemoveType = (id: string) => {
    removeCustomDecisionType(id)
    setLocalCustomTypes(getCustomDecisionTypes())
  }

  const handleTypeColor = (id: string, color: string) => {
    updateCustomDecisionType(id, { color })
    setLocalCustomTypes(getCustomDecisionTypes())
  }

  return (
    <Box>
      <PageHeader
        title="Settings"
        dek="Custom decision types, reason presets, entry tag presets, and anything else that shapes what your forms look like."
        dense
      />

      {/* Custom Decision Types */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1,
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Custom Decision Types</Typography>
            <Typography variant="caption" color="text.secondary">Add your own decision types beyond the built-in ones</Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setNewTypeDialogOpen(true)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', alignSelf: { xs: 'flex-start', sm: 'auto' }, flexShrink: 0 }}
          >
            Add type
          </Button>
        </Box>
        {customTypes.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No custom types yet. Add types like "Hedge", "Rebalance", "Earnings play", etc.
          </Typography>
        ) : (
          <Reorder.Group
            axis="y"
            values={customTypes}
            onReorder={(newOrder) => {
              setLocalCustomTypes(newOrder)
              setCustomDecisionTypes(newOrder)
            }}
            as="div"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
          >
            {customTypes.map((ct) => (
              <Reorder.Item key={ct.id} value={ct} as="div" style={{ listStyle: 'none' }}>
                <Box display="flex" alignItems="center" gap={1} sx={{ py: 0.25, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                  <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} />
                  <ColorSwatch color={ct.color} onChange={(c) => handleTypeColor(ct.id, c)} label={ct.label} />
                  <DecisionChip type={ct.id} size="small" sx={{ pointerEvents: 'none' }} />
                  <Box flex={1} />
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => handleRemoveType(ct.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </Paper>

      {/* Decision Reason Presets */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1,
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Decision Reason Presets</Typography>
            <Typography variant="caption" color="text.secondary">Quick-select reasons when adding decisions. Click the dot to set a color.</Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setNewReasonDialogOpen(true)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', alignSelf: { xs: 'flex-start', sm: 'auto' }, flexShrink: 0 }}
          >
            Add preset
          </Button>
        </Box>
        {reasonPresets.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No presets yet. Add reason presets to quickly select from your shortlist when adding decisions.
          </Typography>
        ) : (
          <Reorder.Group
            axis="y"
            values={reasonPresets}
            onReorder={(newOrder) => {
              setLocalReasonPresets(newOrder)
              setReasonPresets(newOrder)
            }}
            as="div"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
          >
            {reasonPresets.map((r, idx) => (
              <Reorder.Item key={`${r.label}-${idx}`} value={r} as="div" style={{ listStyle: 'none' }}>
                <Box display="flex" alignItems="center" gap={1} sx={{ py: 0.25, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                  <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} />
                  <ColorSwatch color={r.color} onChange={(c) => handleReasonColor(r.label, c)} label={r.label} />
                  <Typography variant="body2" sx={{ flex: 1, ...(r.color ? { color: r.color, fontWeight: 500 } : {}) }}>
                    {r.label}
                  </Typography>
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => handleRemoveReason(idx)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </Paper>

      {/* Entry Tag Presets */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1,
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Entry Tag Presets</Typography>
            <Typography variant="caption" color="text.secondary">Tags for categorizing journal entries. Click the dot to set a color.</Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setNewTagDialogOpen(true)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap', alignSelf: { xs: 'flex-start', sm: 'auto' }, flexShrink: 0 }}
          >
            Add preset
          </Button>
        </Box>
        {tagPresets.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No presets yet. Add tag presets to quickly label your journal entries.
          </Typography>
        ) : (
          <Reorder.Group
            axis="y"
            values={tagPresets}
            onReorder={(newOrder) => {
              setLocalTagPresets(newOrder)
              setTagPresets(newOrder)
            }}
            as="div"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
          >
            {tagPresets.map((t, idx) => (
              <Reorder.Item key={`${t.label}-${idx}`} value={t} as="div" style={{ listStyle: 'none' }}>
                <Box display="flex" alignItems="center" gap={1} sx={{ py: 0.25, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                  <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} />
                  <ColorSwatch color={t.color} onChange={(c) => handleTagColor(t.label, c)} label={t.label} />
                  <TagChip tag={t.label} colorOverride={t.color} />
                  <Box flex={1} />
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => handleRemoveTag(idx)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </Paper>

      {/* Add Reason Dialog */}
      <Dialog open={newReasonDialogOpen} onClose={() => setNewReasonDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add reason preset</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Reason"
            placeholder="e.g. Cheap, Too expensive, Momentum"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddReason() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewReasonDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleAddReason} variant="contained" disabled={!newReason.trim()}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={newTagDialogOpen} onClose={() => setNewTagDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add tag preset</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Tag"
            placeholder="e.g. research, watchlist, follow-up"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTagDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleAddTag} variant="contained" disabled={!newTag.trim()}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Add Custom Type Dialog */}
      <Dialog open={newTypeDialogOpen} onClose={() => setNewTypeDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add custom decision type</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Type name"
              placeholder="e.g. Hedge, Rebalance, Earnings play"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddType() }}
            />
            <Box display="flex" alignItems="center" gap={2}>
              <Typography variant="body2" color="text.secondary">Color:</Typography>
              <input
                type="color"
                value={newTypeColor}
                onChange={(e) => setNewTypeColor(e.target.value)}
                style={{ width: 40, height: 32, cursor: 'pointer', border: 'none', borderRadius: 4 }}
              />
              {newTypeLabel.trim() && (
                <DecisionChip
                  type={`preview_${newTypeLabel}`}
                  label={newTypeLabel}
                  size="small"
                  sx={{ pointerEvents: 'none', bgcolor: newTypeColor, color: '#fff', border: 'none', '& .MuiChip-label': { fontWeight: 600 } }}
                />
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTypeDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleAddType} variant="contained" disabled={!newTypeLabel.trim()}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
