/**
 * ScoreLadder — visible feedback loop for the investment score.
 *
 * Three pieces, always together:
 *   1. The number  — current score + bucket label (Spec/Mixed/Invest)
 *   2. The bar     — fills 0..100 so headroom is visible at a glance
 *   3. The chips   — list of unfired achievable signals, ranked by
 *                    weight desc, each labelled with the +N gain it
 *                    would unlock
 *
 * Mounted in two contexts:
 *   - EntryFormPage (live as the writer types; recomputes on every
 *     keystroke from local form state)
 *   - EntryDetailPage (passive; recomputes from the loaded entry +
 *     actions + valuation)
 *
 * Optional `onSignalClick` lets the host scroll-to / open the
 * relevant section when a chip is clicked. Without a handler, chips
 * still render but are non-interactive — the score ladder is
 * informational either way.
 */

import { Box, Chip, LinearProgress, Tooltip, Typography } from '@mui/material'
import type { ScoringResult, SignalContribution } from '../utils/investmentScore'

export interface ScoreLadderProps {
  result: ScoringResult
  /** Optional click handler for unfired-signal chips. Gets the
   *  signal so the host can route to the matching field/section. */
  onSignalClick?: (signal: SignalContribution) => void
  /** Compact layout: smaller font + tighter spacing for the form
   *  variant. Defaults to false (the detail-page header variant). */
  dense?: boolean
  /** Visual style — 'paper' draws a hairline-bordered box, 'flush'
   *  renders inline without a frame. Default 'paper'. */
  variant?: 'paper' | 'flush'
  /** Cap the number of chips shown. Extras roll up into a "+ N more"
   *  trailing label. Default 4 (typical viewport fits 3–4). */
  maxChips?: number
}

const BUCKET_COLOR: Record<ScoringResult['bucket'], string> = {
  Spec: '#dc2626',
  Mixed: '#ca8a04',
  Invest: '#16a34a',
}

const BUCKET_FAINT: Record<ScoringResult['bucket'], string> = {
  Spec: 'rgba(220, 38, 38, 0.15)',
  Mixed: 'rgba(202, 138, 4, 0.15)',
  Invest: 'rgba(22, 163, 74, 0.15)',
}

export default function ScoreLadder({
  result,
  onSignalClick,
  dense = false,
  variant = 'paper',
  maxChips = 4,
}: ScoreLadderProps) {
  const { score, bucket, unfiredSignals } = result
  const accent = BUCKET_COLOR[bucket]
  const accentFaint = BUCKET_FAINT[bucket]
  const visibleChips = unfiredSignals.slice(0, maxChips)
  const hiddenCount = Math.max(0, unfiredSignals.length - visibleChips.length)
  const headroom = 100 - score

  return (
    <Box
      sx={{
        ...(variant === 'paper'
          ? {
              p: dense ? 1 : 1.25,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }
          : {}),
      }}
    >
      {/* ── Header line: kicker + score + bucket ─────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontSize: '0.62rem',
            color: 'text.disabled',
          }}
        >
          iScore
        </Typography>
        <Typography
          component="span"
          sx={{
            fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontWeight: 700,
            fontSize: dense ? '1.05rem' : '1.25rem',
            color: accent,
            lineHeight: 1,
          }}
        >
          {score}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
          / 100
        </Typography>
        <Box
          sx={{
            ml: 'auto',
            px: 0.75,
            py: 0.1,
            bgcolor: accentFaint,
            color: accent,
            border: '1px solid',
            borderColor: accent,
            borderRadius: 0.75,
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {bucket}
        </Box>
      </Box>

      {/* ── Bar: filled to score, headroom faded ──────────────────── */}
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: 'rgba(15, 23, 42, 0.06)',
          '& .MuiLinearProgress-bar': {
            bgcolor: accent,
            borderRadius: 2,
            transition: 'transform 320ms ease',
          },
        }}
      />

      {/* ── Unfired-signal chips ─────────────────────────────────── */}
      {visibleChips.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.disabled" sx={{ mr: 0.25, fontStyle: 'italic', fontSize: '0.7rem' }}>
            +{headroom} possible:
          </Typography>
          {visibleChips.map((s) => {
            const clickable = !!onSignalClick
            return (
              <Tooltip key={s.label} title={`Adds +${s.weight} to your score`}>
                <Chip
                  size="small"
                  label={
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}>
                      <Box component="span">{s.label}</Box>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontWeight: 700,
                          color: '#15803d',
                          fontSize: '0.7rem',
                        }}
                      >
                        +{s.weight}
                      </Box>
                    </Box>
                  }
                  variant="outlined"
                  onClick={clickable ? () => onSignalClick!(s) : undefined}
                  clickable={clickable}
                  sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '& .MuiChip-label': { px: 0.75 },
                    ...(clickable
                      ? { '&:hover': { borderColor: 'primary.light', color: 'primary.main', bgcolor: 'action.hover' } }
                      : {}),
                  }}
                />
              </Tooltip>
            )
          })}
          {hiddenCount > 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
              + {hiddenCount} more
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.75, color: 'text.disabled', fontStyle: 'italic', fontSize: '0.7rem' }}
        >
          Every structured signal fired — this entry is fully scaffolded.
        </Typography>
      )}
    </Box>
  )
}
