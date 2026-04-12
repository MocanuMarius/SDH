/**
 * Session focus card — top of the Journal page.
 *
 * Implements deliberate-practice focus ("name the sub-skill before each session")
 * ("systematically attack your weakest sub-skill"). Two modes:
 *
 * 1. **No focus set** — shows the weakest sub-skill surfaced by the
 *    per-sub-skill Brier calculation (Feature 2), with a one-click "train this
 *    now" button that writes to localStorage via setSessionFocus.
 *
 * 2. **Focus set** — shows a compact pill with the current focus and a
 *    dismiss button. The focus is auto-picked up by new entries and
 *    predictions created during the session.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import { calculatePerSubSkillBrier } from '../services/analyticsService'
import { SUB_SKILLS, SUB_SKILL_LABELS, SUB_SKILL_DESCRIPTIONS } from '../types/subSkills'
import type { SubSkill } from '../types/subSkills'
import {
  getSessionFocus,
  setSessionFocus,
  clearSessionFocus,
  subscribeSessionFocus,
} from '../utils/sessionFocus'

export default function SessionFocusCard() {
  const [focus, setFocus] = useState<SubSkill | null>(() => getSessionFocus())
  const [weakest, setWeakest] = useState<SubSkill | null>(null)
  const [loading, setLoading] = useState(true)
  const [manualPicker, setManualPicker] = useState<SubSkill | ''>('')
  // Persist expanded state in localStorage so returning users keep their preference.
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('sdh_session_focus_expanded') === '1' } catch (_e) { return false }
  })
  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v
      try { localStorage.setItem('sdh_session_focus_expanded', next ? '1' : '0') } catch (_e) { /* storage full or private mode */ }
      return next
    })
  }

  useEffect(() => {
    const unsub = subscribeSessionFocus(() => setFocus(getSessionFocus()))
    return unsub
  }, [])

  useEffect(() => {
    let cancelled = false
    calculatePerSubSkillBrier()
      .then((snap) => {
        if (cancelled) return
        setWeakest(snap.weakest?.subSkill && snap.weakest.subSkill !== 'unassigned' ? (snap.weakest.subSkill as SubSkill) : null)
      })
      .catch(() => {
        if (!cancelled) setWeakest(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- Focus-set compact pill ----
  if (focus) {
    return (
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          icon={<TrackChangesIcon />}
          label={`Training focus: ${SUB_SKILL_LABELS[focus]}`}
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
        <Typography variant="caption" color="text.secondary">
          New decisions today will be tagged with this sub-skill.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={clearSessionFocus} aria-label="Clear training focus">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    )
  }

  // ---- No focus yet ----
  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2,
        borderLeft: '4px solid',
        borderLeftColor: 'primary.main',
        bgcolor: 'action.hover',
      }}
    >
      {/* Always-visible header row. On mobile this is the whole card until tapped. */}
      <Box
        onClick={toggleExpanded}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: { xs: 1, sm: 1.5 },
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        <TrackChangesIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>
          What are you training today?
        </Typography>
        {loading ? (
          <CircularProgress size={14} />
        ) : (
          weakest && (
            <Chip
              size="small"
              label={SUB_SKILL_LABELS[weakest]}
              variant="outlined"
              color="warning"
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            />
          )
        )}
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              {weakest ? (
                <Alert severity="warning" icon={false} sx={{ mt: 0.5, py: 0.25, fontSize: '0.8rem' }}>
                  <strong>Your weakest sub-skill right now:</strong> {SUB_SKILL_LABELS[weakest]} —{' '}
                  {SUB_SKILL_DESCRIPTIONS[weakest]}. The framework says to target it this quarter.
                </Alert>
              ) : (
                !loading && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Not enough resolved predictions to surface a weakest sub-skill yet. Pick anything you're working on below.
                  </Typography>
                )
              )}
            </Box>
            {weakest && (
              <Button
                size="small"
                variant="contained"
                startIcon={<TrackChangesIcon />}
                onClick={() => setSessionFocus(weakest)}
                sx={{ textTransform: 'none' }}
              >
                Train {SUB_SKILL_LABELS[weakest]}
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 220, flex: { xs: '1 1 100%', sm: 0 } }}>
              <InputLabel>Pick any sub-skill</InputLabel>
              <Select
                value={manualPicker}
                label="Pick any sub-skill"
                onChange={(e) => setManualPicker(e.target.value as SubSkill | '')}
              >
                <MenuItem value="">
                  <em>—</em>
                </MenuItem>
                {SUB_SKILLS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {SUB_SKILL_LABELS[s]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant="outlined"
              disabled={!manualPicker}
              onClick={() => {
                if (manualPicker) setSessionFocus(manualPicker)
              }}
              sx={{ textTransform: 'none' }}
            >
              Set focus
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  )
}
