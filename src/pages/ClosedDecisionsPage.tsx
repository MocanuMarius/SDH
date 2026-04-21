/**
 * ClosedDecisionsPage — a chronological "lessons journal" of every
 * decision that has a recorded outcome. Grouped by month; each
 * entry shows verdict, ticker, one-line notes, and a link back to
 * the owning entry.
 *
 * Complements /actions (raw feed) and /analytics (aggregate
 * numbers) with a reflective view — the reader can skim closed
 * decisions like turning pages in a ledger, looking for patterns.
 *
 * Read-only. No editing happens here; clicking through to the
 * decision / entry is how you drill in.
 */

import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Typography, Paper, Chip, Stack, Skeleton } from '@mui/material'
import { useActions, useOutcomesByActionIds } from '../hooks/queries'
import { PageHeader, EmptyState } from '../components/system'
import DecisionChip from '../components/DecisionChip'
import InsightsIcon from '@mui/icons-material/Insights'
import RelativeDate from '../components/RelativeDate'
import type { Action, Outcome } from '../types/database'

interface ClosedRow {
  action: Action
  outcome: Outcome
  monthKey: string  // "2026-04"
  monthLabel: string // "April 2026"
}

function verdictFromScore(score: number | null | undefined): { label: string; color: string } | null {
  if (score == null) return null
  if (score >= 4) return { label: 'Right call', color: '#16a34a' }
  if (score <= 2) return { label: 'Wrong call', color: '#dc2626' }
  return { label: 'Inconclusive', color: '#64748b' }
}

function monthKeyFromDate(iso: string): { key: string; label: string } {
  const d = new Date(iso)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return { key, label }
}

export default function ClosedDecisionsPage() {
  const navigate = useNavigate()
  const actionsQ = useActions({ limit: 2000 })
  const actionIds = useMemo(() => (actionsQ.data ?? []).map((a) => a.id), [actionsQ.data])
  const outcomesQ = useOutcomesByActionIds(actionIds)
  const loading = actionsQ.isLoading || outcomesQ.isLoading

  // Filter state — "all" / "right" / "wrong" / "inconclusive"
  const [filter, setFilter] = useState<'all' | 'right' | 'wrong' | 'inconclusive'>('all')

  const groups = useMemo(() => {
    const outcomeByAction = new Map<string, Outcome>()
    ;(outcomesQ.data ?? []).forEach((o) => outcomeByAction.set(o.action_id, o))
    const rows: ClosedRow[] = []
    for (const a of (actionsQ.data ?? [])) {
      const o = outcomeByAction.get(a.id)
      if (!o) continue
      // Apply filter
      const v = verdictFromScore(o.outcome_score)
      if (filter === 'right' && v?.label !== 'Right call') continue
      if (filter === 'wrong' && v?.label !== 'Wrong call') continue
      if (filter === 'inconclusive' && v?.label !== 'Inconclusive') continue
      const { key, label } = monthKeyFromDate(o.outcome_date)
      rows.push({ action: a, outcome: o, monthKey: key, monthLabel: label })
    }
    // Sort newest outcome first, then group
    rows.sort((x, y) => y.outcome.outcome_date.localeCompare(x.outcome.outcome_date))
    const byMonth = new Map<string, { label: string; rows: ClosedRow[] }>()
    for (const r of rows) {
      const bucket = byMonth.get(r.monthKey) ?? { label: r.monthLabel, rows: [] }
      bucket.rows.push(r)
      byMonth.set(r.monthKey, bucket)
    }
    return Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [actionsQ.data, outcomesQ.data, filter])

  const totalClosed = (outcomesQ.data ?? []).length

  return (
    <Box>
      <PageHeader
        title="Lessons"
        eyebrow="Closed decisions"
        dense
      />
      <Typography
        variant="body2"
        sx={{
          fontStyle: 'italic',
          color: 'text.secondary',
          mb: 2,
          fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
        }}
      >
        A chronological ledger of your closed decisions. Skim for patterns.
      </Typography>

      {/* Verdict filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {(['all', 'right', 'wrong', 'inconclusive'] as const).map((v) => (
          <Chip
            key={v}
            label={v === 'all' ? `All (${totalClosed})` : v === 'right' ? 'Right' : v === 'wrong' ? 'Wrong' : 'Inconclusive'}
            size="small"
            variant={filter === v ? 'filled' : 'outlined'}
            color={filter === v ? 'primary' : 'default'}
            onClick={() => setFilter(v)}
            sx={{ fontWeight: filter === v ? 700 : 500 }}
          />
        ))}
      </Box>

      {loading ? (
        <Stack spacing={1}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />)}
        </Stack>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<InsightsIcon />}
          title="No closed decisions yet"
          description="When you mark a decision Right / Wrong / Inconclusive, it'll show up here grouped by month. The idea is to make patterns visible across time."
        />
      ) : (
        <Stack spacing={3}>
          {groups.map(([key, bucket]) => (
            <Box key={key}>
              <Typography
                variant="overline"
                sx={{
                  color: 'text.disabled',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  display: 'block',
                  mb: 0.75,
                }}
              >
                {bucket.label}
              </Typography>
              <Stack spacing={1}>
                {bucket.rows.map(({ action, outcome }) => {
                  const v = verdictFromScore(outcome.outcome_score)
                  return (
                    <Paper
                      key={outcome.id}
                      variant="outlined"
                      onClick={() => {
                        // Clicking routes into the owning entry (so
                        // the reader sees context) rather than
                        // straight to the outcome edit page.
                        if (action.entry_id) navigate(`/entries/${action.entry_id}`)
                        else navigate(`/outcomes/${action.id}/edit`)
                      }}
                      sx={{
                        p: 1.25,
                        cursor: 'pointer',
                        transition: 'background-color 140ms ease, transform 140ms ease',
                        '@media (hover: hover)': {
                          '&:hover': { bgcolor: 'action.hover', transform: 'translateX(2px)' },
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                        <DecisionChip type={action.type} size="small" />
                        {action.ticker && (
                          <Typography variant="body2" fontWeight={700} color="primary.dark">
                            ${action.ticker}
                          </Typography>
                        )}
                        {v && (
                          <Chip
                            label={v.label}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              bgcolor: `${v.color}18`,
                              color: v.color,
                              border: '1px solid',
                              borderColor: `${v.color}66`,
                            }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                          closed <RelativeDate date={outcome.outcome_date} />
                        </Typography>
                      </Box>
                      {outcome.notes && (
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 0.5,
                            color: 'text.secondary',
                            fontStyle: 'italic',
                            fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {outcome.notes}
                        </Typography>
                      )}
                      {action.entry_id && (
                        <Typography
                          component={RouterLink}
                          to={`/entries/${action.entry_id}`}
                          onClick={(e) => e.stopPropagation()}
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            display: 'inline-block',
                            color: 'primary.main',
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          Entry →
                        </Typography>
                      )}
                    </Paper>
                  )
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}
