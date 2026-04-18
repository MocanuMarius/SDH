import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
} from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useEntries, useActions, useOutcomes } from '../hooks/queries'
import { isAutomatedEntry } from '../utils/entryTitle'
import type { Entry, Action, Outcome } from '../types/database'
import { PageHeader, EmptyState, MetricTile } from '../components/system'

interface LongTermDecision {
  entry: Entry
  action: Action | null
  outcome: Outcome | null
  daysUntilHorizon: number
  status: 'overdue' | 'upcoming' | 'resolved'
  isResolved: boolean
}

export default function LongTermDecisionsPage() {
  // ─── Server data via react-query (auto-refreshes after mutations elsewhere) ───
  const entriesQ = useEntries()
  const actionsQ = useActions()
  const outcomesQ = useOutcomes()
  const loading = entriesQ.isLoading || actionsQ.isLoading || outcomesQ.isLoading
  const queryError = entriesQ.error || actionsQ.error || outcomesQ.error
  const error = queryError ? (queryError as Error).message : null
  const [, setError] = useState<string | null>(null) // kept for any local error needs (unused now)
  void setError

  const decisions = useMemo<LongTermDecision[]>(() => {
    const entries = entriesQ.data ?? []
    const actions = actionsQ.data ?? []
    const outcomes = outcomesQ.data ?? []
    // Filter out automated IBKR entries + only keep entries with a decision horizon
    const entriesWithHorizon = entries.filter((e) => e.decision_horizon && !isAutomatedEntry(e))
    const actionMap = new Map(actions.map((a: Action) => [a.entry_id, a]))
    const outcomeByActionId = new Map(outcomes.map((o: Outcome) => [o.action_id, o]))
    const data: LongTermDecision[] = entriesWithHorizon.map((entry: Entry) => {
      const action = actionMap.get(entry.id) || null
      const outcome = action ? outcomeByActionId.get(action.id) || null : null
      const horizonDate = new Date(entry.decision_horizon!)
      const today = new Date()
      const daysUntilHorizon = Math.floor((horizonDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      let status: 'overdue' | 'upcoming' | 'resolved'
      if (outcome) status = 'resolved'
      else if (daysUntilHorizon < 0) status = 'overdue'
      else status = 'upcoming'
      return { entry, action, outcome, daysUntilHorizon, status, isResolved: !!outcome }
    })
    // Sort: overdue first, then by days until horizon
    data.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (a.status !== 'overdue' && b.status === 'overdue') return 1
      return a.daysUntilHorizon - b.daysUntilHorizon
    })
    return data
  }, [entriesQ.data, actionsQ.data, outcomesQ.data])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  const overdue = decisions.filter((d) => d.status === 'overdue')
  const upcoming = decisions.filter((d) => d.status === 'upcoming')
  const resolved = decisions.filter((d) => d.status === 'resolved')

  const getStatusColor = (decision: LongTermDecision) => {
    if (decision.status === 'overdue') return '#dc2626'
    if (decision.status === 'upcoming') return '#f59e0b'
    return '#16a34a'
  }

  const getStatusLabel = (decision: LongTermDecision) => {
    if (decision.status === 'resolved') return 'Resolved'
    if (decision.status === 'overdue') return 'Overdue'
    if (decision.daysUntilHorizon <= 7) return 'Due soon'
    return 'Upcoming'
  }

  return (
    <Box>
      <PageHeader title="Long-term horizons" />

      {decisions.length > 0 && (
        <Box display="flex" gap={1.5} sx={{ mb: 3 }} flexWrap="wrap">
          <MetricTile label="Total" value={decisions.length} />
          {overdue.length > 0 && (
            <MetricTile label="Overdue" value={overdue.length} tone="negative" />
          )}
          {upcoming.length > 0 && (
            <MetricTile label="Upcoming" value={upcoming.length} tone="default" />
          )}
          {resolved.length > 0 && (
            <MetricTile label="Resolved" value={resolved.length} tone="positive" />
          )}
        </Box>
      )}

      {decisions.length === 0 ? (
        <EmptyState
          title="No long-term horizons yet"
          description={
            <>
              This page tracks entries with an explicit "I expect this to play out by ___" date.
              To put something here: open the entry form and tick <strong>+ Add prediction</strong>,
              then set a Decision Horizon date.
            </>
          }
          action={
            <Button component={RouterLink} to="/entries/new" variant="contained" size="small">
              New entry
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>Decision</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Expected Resolution</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Status
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Days Remaining
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Action
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {decisions.map((decision) => (
                <TableRow key={decision.entry.id}>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                        {decision.entry.title_markdown || '(No title)'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {decision.entry.date}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{decision.entry.decision_horizon}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={getStatusLabel(decision)}
                      size="small"
                      sx={{
                        color: '#fff',
                        bgcolor: getStatusColor(decision),
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ color: getStatusColor(decision), fontWeight: 600 }}>
                    {decision.status === 'resolved'
                      ? '✓'
                      : decision.daysUntilHorizon > 0
                        ? `${decision.daysUntilHorizon} days`
                        : `${Math.abs(decision.daysUntilHorizon)} days ago`}
                  </TableCell>
                  <TableCell align="center">
                    {decision.action ? (
                      <Box display="flex" gap={0.5} justifyContent="center" flexWrap="wrap">
                        <Chip label={decision.action.type} size="small" variant="outlined" />
                        {decision.action.ticker && <Chip label={decision.action.ticker} size="small" />}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No action
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      component={RouterLink}
                      to={`/entries/${decision.entry.id}`}
                      variant="text"
                      size="small"
                      endIcon={<OpenInNewIcon />}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

    </Box>
  )
}
