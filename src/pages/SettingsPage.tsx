import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Reorder } from 'motion/react'
import { getReasonPresets, setReasonPresets, removeReasonPresetAtIndex, updateReasonPresetColor } from '../utils/reasonPresets'
import type { ReasonPreset } from '../utils/reasonPresets'
import { getTagPresets, setTagPresets, removeTagPresetAtIndex, updateTagPresetColor } from '../utils/tagPresets'
import type { TagPreset } from '../utils/tagPresets'
import {
  getCustomDecisionTypes,
  setCustomDecisionTypes,
  addCustomDecisionType,
  removeCustomDecisionType,
  updateCustomDecisionType,
} from '../utils/customDecisionTypes'
import type { CustomDecisionType } from '../utils/customDecisionTypes'
import TagChip from '../components/TagChip'
import DecisionChip from '../components/DecisionChip'
import { PageHeader, ListCard, ItemRow, AddPlusButton } from '../components/system'

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
      <PageHeader title="Settings" dense />

      <Stack spacing={1.5}>
        {/* Custom Decision Types */}
        <ListCard
          title="Custom Decision Types"
          count={customTypes.length}
          headerAction={<AddPlusButton label="Add custom decision type" onClick={() => setNewTypeDialogOpen(true)} />}
        >
          {customTypes.length === 0 ? (
            <Typography color="text.secondary" variant="caption" sx={{ pl: 0.5 }}>None yet.</Typography>
          ) : (
            <Reorder.Group
              axis="y"
              values={customTypes}
              onReorder={(newOrder) => {
                setLocalCustomTypes(newOrder)
                setCustomDecisionTypes(newOrder)
              }}
              as="div"
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {customTypes.map((ct) => (
                <Reorder.Item key={ct.id} value={ct} as="div" style={{ listStyle: 'none' }}>
                  <ItemRow onDelete={() => handleRemoveType(ct.id)} ariaLabel="Remove decision type">
                    <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' } }} />
                    <ColorSwatch color={ct.color} onChange={(c) => handleTypeColor(ct.id, c)} label={ct.label} />
                    <DecisionChip type={ct.id} size="small" sx={{ pointerEvents: 'none' }} />
                  </ItemRow>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </ListCard>

        {/* Decision Reason Presets */}
        <ListCard
          title="Decision Reason Presets"
          count={reasonPresets.length}
          headerAction={<AddPlusButton label="Add reason preset" onClick={() => setNewReasonDialogOpen(true)} />}
        >
          {reasonPresets.length === 0 ? (
            <Typography color="text.secondary" variant="caption" sx={{ pl: 0.5 }}>None yet.</Typography>
          ) : (
            <Reorder.Group
              axis="y"
              values={reasonPresets}
              onReorder={(newOrder) => {
                setLocalReasonPresets(newOrder)
                setReasonPresets(newOrder)
              }}
              as="div"
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {reasonPresets.map((r, idx) => (
                <Reorder.Item key={`${r.label}-${idx}`} value={r} as="div" style={{ listStyle: 'none' }}>
                  <ItemRow onDelete={() => handleRemoveReason(idx)} ariaLabel="Remove reason preset">
                    <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' } }} />
                    <ColorSwatch color={r.color} onChange={(c) => handleReasonColor(r.label, c)} label={r.label} />
                    <Typography variant="body2" sx={{ ...(r.color ? { color: r.color, fontWeight: 500 } : {}) }}>
                      {r.label}
                    </Typography>
                  </ItemRow>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </ListCard>

        {/* Entry Tag Presets */}
        <ListCard
          title="Entry Tag Presets"
          count={tagPresets.length}
          headerAction={<AddPlusButton label="Add tag preset" onClick={() => setNewTagDialogOpen(true)} />}
        >
          {tagPresets.length === 0 ? (
            <Typography color="text.secondary" variant="caption" sx={{ pl: 0.5 }}>None yet.</Typography>
          ) : (
            <Reorder.Group
              axis="y"
              values={tagPresets}
              onReorder={(newOrder) => {
                setLocalTagPresets(newOrder)
                setTagPresets(newOrder)
              }}
              as="div"
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {tagPresets.map((t, idx) => (
                <Reorder.Item key={`${t.label}-${idx}`} value={t} as="div" style={{ listStyle: 'none' }}>
                  <ItemRow onDelete={() => handleRemoveTag(idx)} ariaLabel="Remove tag preset">
                    <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0, cursor: 'grab', '&:active': { cursor: 'grabbing' } }} />
                    <ColorSwatch color={t.color} onChange={(c) => handleTagColor(t.label, c)} label={t.label} />
                    <TagChip tag={t.label} colorOverride={t.color} />
                  </ItemRow>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </ListCard>
      </Stack>

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
