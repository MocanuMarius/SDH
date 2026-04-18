/**
 * Per-sub-skill Brier score panel (Rules 7 + 16).
 *
 * Shows calibration Brier broken out by the 11 deliberate-practice sub-skills,
 * ranked from best to worst. A prominent "weakest sub-skill" nudge surfaces
 * the one you should attack next quarter.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material'
import { calculatePerSubSkillBrier } from '../../services/analyticsService'
import type { PerSubSkillBrierSnapshot } from '../../services/analyticsService'
import { SUB_SKILL_LABELS, SUB_SKILL_DESCRIPTIONS } from '../../types/subSkills'
import type { SubSkill } from '../../types/subSkills'

function formatSubSkillLabel(key: string): string {
  if (key === 'unassigned') return 'Unassigned'
  return SUB_SKILL_LABELS[key as SubSkill] ?? key
}

function formatSubSkillDesc(key: string): string {
  if (key === 'unassigned') return 'Predictions with no sub-skill tag — untracked training signal'
  return SUB_SKILL_DESCRIPTIONS[key as SubSkill] ?? ''
}

/** Brier 0 = perfect, 0.25 = random, 0.5+ = overconfident. Map to 0-100 bar %. */
function brierToBarPct(brier: number): number {
  // 0 → 100% bar, 0.5 → 0% bar, linear
  return Math.max(0, Math.min(100, (1 - brier * 2) * 100))
}

function brierTone(brier: number): 'success' | 'info' | 'warning' | 'error' {
  if (brier < 0.15) return 'success'
  if (brier < 0.25) return 'info'
  if (brier < 0.35) return 'warning'
  return 'error'
}

export default function PerSubSkillBrier() {
  const [snapshot, setSnapshot] = useState<PerSubSkillBrierSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    calculatePerSubSkillBrier()
      .then((data) => {
        if (!cancelled) setSnapshot(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Brier stats')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <LinearProgress />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Computing per-sub-skill Brier scores…
        </Typography>
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  if (!snapshot || snapshot.stats.length === 0) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" fontWeight={600}>
          No resolved sub-skill predictions yet.
        </Typography>
      </Alert>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Alert severity="info">
        <Typography variant="body2">
          <strong>Brier per sub-skill:</strong> 0.0 = perfect forecasting, 0.25 ≈ coin-flip, 0.5+ =
          dangerously overconfident. Track these quarterly and spend your next cycle on the weakest
          sub-skill.
        </Typography>
      </Alert>

      {/* Weakest sub-skill — prominent nudge */}
      {snapshot.weakest && (
        <Paper
          variant="outlined"
          sx={{
            p: 2.5,
            borderLeft: '4px solid #dc2626',
            bgcolor: '#fef2f2',
          }}
        >
          <Typography variant="caption" color="#991b1b" fontWeight={600} letterSpacing={0.5}>
            YOUR WEAKEST SUB-SKILL RIGHT NOW
          </Typography>
          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#7f1d1d' }}>
            {formatSubSkillLabel(snapshot.weakest.subSkill)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Brier {snapshot.weakest.brier.toFixed(3)} · {snapshot.weakest.resolvedCount} resolved
            prediction{snapshot.weakest.resolvedCount === 1 ? '' : 's'} · directional accuracy{' '}
            {snapshot.weakest.accuracy.toFixed(0)}%
          </Typography>
          <Typography variant="body2" color="#7f1d1d">
            <strong>Target this quarter:</strong> build a curriculum around {formatSubSkillLabel(snapshot.weakest.subSkill).toLowerCase()}. Review every decision from the last 3 years that exercised this skill. Build heuristics from the data, not from theory.
          </Typography>
        </Paper>
      )}

      {/* Strongest — balancing positive feedback */}
      {snapshot.strongest && snapshot.strongest.subSkill !== snapshot.weakest?.subSkill && (
        <Paper
          variant="outlined"
          sx={{
            p: 2.5,
            borderLeft: '4px solid #16a34a',
            bgcolor: '#f0fdf4',
          }}
        >
          <Typography variant="caption" color="#166534" fontWeight={600} letterSpacing={0.5}>
            YOUR STRONGEST SUB-SKILL
          </Typography>
          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#14532d' }}>
            {formatSubSkillLabel(snapshot.strongest.subSkill)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Brier {snapshot.strongest.brier.toFixed(3)} · {snapshot.strongest.resolvedCount} resolved · accuracy {snapshot.strongest.accuracy.toFixed(0)}%
          </Typography>
        </Paper>
      )}

      {/* Full ranked table */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Ranked by Brier (best → worst)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {snapshot.stats.map((s) => {
              const tone = brierTone(s.brier)
              const barPct = brierToBarPct(s.brier)
              const qualifies = s.resolvedCount >= snapshot.minSampleSize
              return (
                <Box key={s.subSkill} sx={{ opacity: qualifies ? 1 : 0.55 }}>
                  <Box display="flex" alignItems="baseline" justifyContent="space-between">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {formatSubSkillLabel(s.subSkill)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatSubSkillDesc(s.subSkill)}
                      </Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="body2" fontWeight={700} color={`${tone}.main`}>
                        {s.brier.toFixed(3)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.resolvedCount} resolved · {s.accuracy.toFixed(0)}% acc
                      </Typography>
                    </Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={barPct}
                    color={tone}
                    sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                  />
                  {!qualifies && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', fontStyle: 'italic' }}>
                      Needs at least {snapshot.minSampleSize} resolved predictions before it is ranked.
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
