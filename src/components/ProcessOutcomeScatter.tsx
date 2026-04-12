/**
 * Process × Outcome 2×2 scatter (R15 / R19 / R20).
 *
 * Plots every scored outcome on a 5x5 grid where the X axis is process score
 * and the Y axis is outcome score. The four quadrants carry different meanings:
 *
 *   Upper-left  (high outcome, low process)  — LUCKY: review for what you did
 *                                               wrong that still paid off.
 *   Upper-right (high outcome, high process) — SKILLED: reinforce.
 *   Lower-left  (low outcome, low process)   — JUST BAD: expected.
 *   Lower-right (low outcome, high process)  — UNLUCKY: process was right,
 *                                               reality intervened. CELEBRATE.
 *
 * Also displays the Pearson correlation between process and outcome scores.
 * Pure luck ≈ 0, pure skill ≈ 1, real investor ≈ 0.3–0.5 with noise.
 * Correlation near 0 means "you're not learning anything" (R20).
 */

import { Fragment } from 'react'
import { Box, Paper, Typography, Tooltip } from '@mui/material'
import type { OutcomeAnalytics } from '../types/analytics'

interface ProcessOutcomeScatterProps {
  outcomes: OutcomeAnalytics[]
}

interface CellData {
  process: number
  outcome: number
  items: OutcomeAnalytics[]
}

/** Pearson correlation coefficient between two equal-length numeric arrays. */
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return 0
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  if (denom === 0) return 0
  return num / denom
}

/** Label that interprets a correlation value against the framework's benchmarks. */
function interpretCorrelation(r: number, n: number): { label: string; tone: 'error' | 'warning' | 'success' | 'info' } {
  if (n < 5) return { label: 'Need ≥ 5 scored outcomes to interpret', tone: 'info' }
  if (r < 0.1) return { label: 'Near zero — your process is not predicting outcomes. You may not be learning.', tone: 'error' }
  if (r < 0.3) return { label: 'Weak — slight signal, mostly noise. Keep scoring.', tone: 'warning' }
  if (r < 0.6) return { label: 'Healthy — in the 0.3–0.5 band the framework expects for real investors.', tone: 'success' }
  return { label: 'Very strong — verify you are not double-counting outcome into process score.', tone: 'info' }
}

export default function ProcessOutcomeScatter({ outcomes }: ProcessOutcomeScatterProps) {
  const scored = outcomes.filter((o) => o.processScore != null && o.outcomeScore != null)
  const n = scored.length

  // Build a 5x5 grid keyed by (process, outcome) cell.
  const grid: CellData[][] = []
  for (let y = 5; y >= 1; y--) {
    const row: CellData[] = []
    for (let x = 1; x <= 5; x++) {
      row.push({
        process: x,
        outcome: y,
        items: scored.filter((o) => o.processScore === x && o.outcomeScore === y),
      })
    }
    grid.push(row)
  }

  const maxCount = Math.max(1, ...grid.flat().map((c) => c.items.length))

  const r = pearson(
    scored.map((o) => o.processScore!),
    scored.map((o) => o.outcomeScore!),
  )
  const { label: rLabel, tone: rTone } = interpretCorrelation(r, n)

  // Framework quadrants (using >=3 as "high")
  const quadrantCount = (procLow: boolean, outLow: boolean) =>
    scored.filter((o) => (o.processScore! < 3) === procLow && (o.outcomeScore! < 3) === outLow).length

  const luckyWins = quadrantCount(true, false) // low process, high outcome
  const skilledWins = quadrantCount(false, false) // high process, high outcome
  const unluckyLosses = quadrantCount(false, true) // high process, low outcome
  const justBad = quadrantCount(true, true)

  if (n === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
          Process × Outcome (R15 / R19)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No scored outcomes yet. When you close a position and score it 1–5 on process and outcome, this chart will populate.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Process × Outcome Scatter
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Every closed position scored on both dimensions. High-process / low-outcome (top-left of the top row) are your BEST trades — the framework's R21 celebration zone.
        </Typography>
      </Box>

      {/* Quadrant summary */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
        <Box sx={{ p: 1.5, bgcolor: '#dcfce7', borderRadius: 1, borderLeft: '4px solid #16a34a' }}>
          <Typography variant="caption" color="text.secondary">Skilled wins</Typography>
          <Typography variant="h5" fontWeight={700} color="#166534">{skilledWins}</Typography>
          <Typography variant="caption">high process, high outcome</Typography>
        </Box>
        <Box sx={{ p: 1.5, bgcolor: '#dbeafe', borderRadius: 1, borderLeft: '4px solid #2563eb' }}>
          <Typography variant="caption" color="text.secondary">Unlucky losses ★</Typography>
          <Typography variant="h5" fontWeight={700} color="#1e40af">{unluckyLosses}</Typography>
          <Typography variant="caption">high process, low outcome — celebrate</Typography>
        </Box>
        <Box sx={{ p: 1.5, bgcolor: '#fef3c7', borderRadius: 1, borderLeft: '4px solid #d97706' }}>
          <Typography variant="caption" color="text.secondary">Lucky wins ⚠</Typography>
          <Typography variant="h5" fontWeight={700} color="#92400e">{luckyWins}</Typography>
          <Typography variant="caption">low process, high outcome — warning</Typography>
        </Box>
        <Box sx={{ p: 1.5, bgcolor: '#fee2e2', borderRadius: 1, borderLeft: '4px solid #dc2626' }}>
          <Typography variant="caption" color="text.secondary">Just bad</Typography>
          <Typography variant="h5" fontWeight={700} color="#991b1b">{justBad}</Typography>
          <Typography variant="caption">low process, low outcome</Typography>
        </Box>
      </Box>

      {/* Correlation summary */}
      <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Box display="flex" alignItems="baseline" gap={2}>
          <Typography variant="caption" color="text.secondary">
            Process → Outcome correlation (r)
          </Typography>
          <Typography variant="h6" fontWeight={700} color={`${rTone}.main`}>
            {r.toFixed(2)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({n} scored outcomes)
          </Typography>
        </Box>
        <Typography variant="caption" color={`${rTone}.main`}>
          {rLabel}
        </Typography>
      </Box>

      {/* 5x5 heatmap grid */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            minWidth: 20,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Outcome score →
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(5, 1fr)', gap: 0.5 }}>
            {grid.map((row, rowIdx) => (
              <Fragment key={`row-${rowIdx}`}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 0.5 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {row[0].outcome}
                  </Typography>
                </Box>
                {row.map((cell) => {
                  const count = cell.items.length
                  const intensity = count / maxCount
                  // Color by framework quadrant
                  const procHigh = cell.process >= 3
                  const outHigh = cell.outcome >= 3
                  const baseColor =
                    procHigh && outHigh ? '#16a34a' : // skilled
                    procHigh && !outHigh ? '#2563eb' : // unlucky (celebrate)
                    !procHigh && outHigh ? '#d97706' : // lucky (warning)
                    '#dc2626' // just bad
                  return (
                    <Tooltip
                      key={`cell-${cell.process}-${cell.outcome}`}
                      title={
                        <Box>
                          <Typography variant="caption" display="block" fontWeight={600}>
                            Process {cell.process} × Outcome {cell.outcome}
                          </Typography>
                          <Typography variant="caption" display="block">
                            {count} trade{count === 1 ? '' : 's'}
                          </Typography>
                          {cell.items.slice(0, 5).map((it) => (
                            <Typography key={it.actionId} variant="caption" display="block">
                              {it.ticker} · {it.returnPercent != null ? `${it.returnPercent.toFixed(1)}%` : '—'}
                            </Typography>
                          ))}
                          {cell.items.length > 5 && (
                            <Typography variant="caption" display="block">
                              +{cell.items.length - 5} more
                            </Typography>
                          )}
                        </Box>
                      }
                    >
                      <Box
                        sx={{
                          aspectRatio: '1',
                          borderRadius: 0.5,
                          bgcolor: count === 0 ? 'action.hover' : baseColor,
                          opacity: count === 0 ? 0.15 : 0.25 + intensity * 0.75,
                          border: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: count > 0 ? 'pointer' : 'default',
                          transition: 'transform 0.1s',
                          '&:hover': count > 0 ? { transform: 'scale(1.05)' } : {},
                        }}
                      >
                        {count > 0 && (
                          <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }}>
                            {count}
                          </Typography>
                        )}
                      </Box>
                    </Tooltip>
                  )
                })}
              </Fragment>
            ))}
            {/* X axis labels */}
            <Box />
            {[1, 2, 3, 4, 5].map((x) => (
              <Box key={`xlabel-${x}`} sx={{ textAlign: 'center', pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {x}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ textAlign: 'center', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Process score →
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  )
}
