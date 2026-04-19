import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
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
import LogoutIcon from '@mui/icons-material/Logout'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import TagChip from '../components/TagChip'
import DecisionChip from '../components/DecisionChip'
import { PageHeader, ListCard, ItemRow } from '../components/system'
import { useAuth } from '../contexts/AuthContext'
import { listEntries } from '../services/entriesService'
import { listActions } from '../services/actionsService'
import { listOutcomes } from '../services/outcomesService'

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
  const { user, signOut } = useAuth()
  const [reasonPresets, setLocalReasonPresets] = useState<ReasonPreset[]>([])
  const [tagPresets, setLocalTagPresets] = useState<TagPreset[]>([])
  const [customTypes, setLocalCustomTypes] = useState<CustomDecisionType[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  /**
   * One-click full data export — pulls every entry, action, and
   * outcome the user has and ships them as a single JSON file.
   * Useful for backup, for moving to another instance, or just for
   * the peace of mind of "I can take my data with me." Names the
   * file `deecide-export-YYYY-MM-DD.json` so multiple exports stay
   * sortable on disk.
   */
  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const [entries, actions, outcomes] = await Promise.all([
        listEntries({ limit: 100000 }),
        listActions({ limit: 100000 }),
        listOutcomes(),
      ])
      const payload = {
        exported_at: new Date().toISOString(),
        version: 1,
        counts: { entries: entries.length, actions: actions.length, outcomes: outcomes.length },
        entries,
        actions,
        outcomes,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ymd = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `deecide-export-${ymd}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Inline-add inputs — used to be three separate Dialogs, now they
  // live as always-visible rows at the bottom of each list card. No
  // modal step for "type a string + click Add."
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
        {/* Account — surfaces email + sign-out. Sign-out used to be
            only in the hamburger nav; surfacing it here too means
            users who think of it as a setting can find it where they
            expect. */}
        <ListCard title="Account">
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Signed in as
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                  {user?.email ?? 'unknown'}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={() => signOut()}
                sx={{ textTransform: 'none', flexShrink: 0 }}
              >
                Sign out
              </Button>
            </Box>
          </Stack>
        </ListCard>

        {/* Data — full backup as JSON. Lets the user lift their data
            out at any time without going through Supabase directly. */}
        <ListCard title="Data">
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>Export everything</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  All entries, decisions, and outcomes as a single JSON file.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExport}
                disabled={exporting}
                sx={{ textTransform: 'none', flexShrink: 0 }}
              >
                {exporting ? 'Exporting…' : 'Export JSON'}
              </Button>
            </Box>
            {exportError && (
              <Typography variant="caption" color="error.main">
                {exportError}
              </Typography>
            )}
          </Stack>
        </ListCard>

        {/* Custom Decision Types */}
        <ListCard
          title="Custom Decision Types"
          count={customTypes.length}
        >
          {customTypes.length > 0 && (
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
          {/* Inline add row — replaces the previous "+ Add custom decision
              type" button + dialog. Single TextField + colour picker +
              Add. Hitting Enter or clicking Add appends, then clears. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: customTypes.length > 0 ? 1 : 0.5 }}>
            <TextField
              size="small"
              placeholder="e.g. Hedge, Rebalance, Earnings play"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddType() } }}
              sx={{ flex: 1 }}
            />
            <input
              type="color"
              value={newTypeColor}
              onChange={(e) => setNewTypeColor(e.target.value)}
              style={{ width: 36, height: 32, cursor: 'pointer', border: 'none', borderRadius: 4, flexShrink: 0 }}
              aria-label="Pick colour for new decision type"
            />
            <Button size="small" variant="outlined" disabled={!newTypeLabel.trim()} onClick={handleAddType} sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}>
              Add
            </Button>
          </Box>
        </ListCard>

        {/* Decision Reason Presets */}
        <ListCard
          title="Decision Reason Presets"
          count={reasonPresets.length}
        >
          {reasonPresets.length > 0 && (
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: reasonPresets.length > 0 ? 1 : 0.5 }}>
            <TextField
              size="small"
              placeholder="e.g. Cheap, Too expensive, Momentum"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddReason() } }}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="outlined" disabled={!newReason.trim()} onClick={handleAddReason} sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}>
              Add
            </Button>
          </Box>
        </ListCard>

        {/* Entry Tag Presets */}
        <ListCard
          title="Entry Tag Presets"
          count={tagPresets.length}
        >
          {tagPresets.length > 0 && (
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: tagPresets.length > 0 ? 1 : 0.5 }}>
            <TextField
              size="small"
              placeholder="e.g. research, watchlist, follow-up"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
              sx={{ flex: 1 }}
            />
            <Button size="small" variant="outlined" disabled={!newTag.trim()} onClick={handleAddTag} sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}>
              Add
            </Button>
          </Box>
        </ListCard>
      </Stack>

      {/* The three Add-X dialogs that used to live here got inlined as
          input rows at the bottom of each ListCard above. Click Add or
          press Enter to append; the row clears for the next entry. No
          modal interruption for "type a string + click Add." */}
    </Box>
  )
}
