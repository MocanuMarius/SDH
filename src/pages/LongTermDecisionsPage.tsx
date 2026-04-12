import { useEffect, useState } from 'react'
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
import { listEntries } from '../services/entriesService'
import { listActions } from '../services/actionsService'
import { listOutcomes } from '../services/outcomesService'
import { isAutomatedEntry } from '../utils/entryTitle'
import type { Entry, Action, Outcome } from '../types/database'

interface LongTermDecision {
  entry: Entry
  action: Action | null
  outcome: Outcome | null
  daysUntilHorizon: number
  status: 'overdue' | 'upcoming' | 'resolved'
  isResolved: boolean
}

export default function LongTermDecisionsPage() {
  const [decisions, setDecisions] = useState<LongTermDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDecisions()
  }, [])

  async function loadDecisions() {
    setLoading(true)
    setError(null)
    try {
      const [entries, actions, outcomes] = await Promise.all([
        listEntries(),
        listActions(),
        listOutcomes(),
      ])

      // Filter out automated IBKR entries + only keep entries with a decision horizon
      const entriesWithHorizon = entries.filter((e) => e.decision_horizon && !isAutomatedEntry(e))

      // Build lookup maps
      const actionMap = new Map(actions.map((a: Action) => [a.entry_id, a]))
      const outcomeByActionId = new Map(outcomes.map((o: Outcome) => [o.action_id, o]))

      // Create decision records
      const decisionsData: LongTermDecision[] = entriesWithHorizon.map((entry) => {
        const action = actionMap.get(entry.id) || null
        const outcome = action ? outcomeByActionId.get(action.id) || null : null
        const horizonDate = new Date(entry.decision_horizon!)
        const today = new Date()
        const daysUntilHorizon = Math.floor((horizonDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        let status: 'overdue' | 'upcoming' | 'resolved'
        if (outcome) {
          status = 'resolved'
        } else if (daysUntilHorizon < 0) {
          status = 'overdue'
        } else {
          status = 'upcoming'
        }

        return {
          entry,
          action,
          outcome,
          daysUntilHorizon,
          status,
          isResolved: !!outcome,
        }
      })

      // Sort: overdue first, then by days until horizon
      decisionsData.sort((a, b) => {
        if (a.status === 'overdue' && b.status !== 'overdue') return -1
        if (a.status !== 'overdue' && b.status === 'overdue') return 1
        return a.daysUntilHorizon - b.daysUntilHorizon
      })

      setDecisions(decisionsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load decisions')
    } finally {
      setLoading(false)
    }
  }

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
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Decisions
      </Typography>

      {/* Summary Cards */}
      <Box display="flex" gap={2} sx={{ mb: 3 }} flexWrap="wrap">
        <Paper sx={{ p: 2, flex: '1 1 100px', minWidth: 120 }}>
          <Typography color="textSecondary" gutterBottom>
            Total Decisions
          </Typography>
          <Typography variant="h6">{decisions.length}</Typography>
        </Paper>
        {overdue.length > 0 && (
          <Paper sx={{ p: 2, flex: '1 1 100px', minWidth: 120, bgcolor: '#fee2e2' }}>
            <Typography color="error" gutterBottom>
              Overdue
            </Typography>
            <Typography variant="h6" sx={{ color: '#dc2626' }}>
              {overdue.length}
            </Typography>
          </Paper>
        )}
        {upcoming.length > 0 && (
          <Paper sx={{ p: 2, flex: '1 1 100px', minWidth: 120, bgcolor: '#fef3c7' }}>
            <Typography sx={{ color: '#f59e0b' }} gutterBottom>
              Upcoming
            </Typography>
            <Typography variant="h6" sx={{ color: '#f59e0b' }}>
              {upcoming.length}
            </Typography>
          </Paper>
        )}
        {resolved.length > 0 && (
          <Paper sx={{ p: 2, flex: '1 1 100px', minWidth: 120, bgcolor: '#dcfce7' }}>
            <Typography sx={{ color: '#16a34a' }} gutterBottom>
              Resolved
            </Typography>
            <Typography variant="h6" sx={{ color: '#16a34a' }}>
              {resolved.length}
            </Typography>
          </Paper>
        )}
      </Box>

      {decisions.length === 0 ? (
        <Alert severity="info">
          No decisions with a resolution date yet. Add a decision horizon when creating/editing entries to track long-term decisions.
        </Alert>
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
