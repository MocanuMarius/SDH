import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Collapse,
  IconButton,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import FilterListIcon from '@mui/icons-material/FilterList'
import CloseIcon from '@mui/icons-material/Close'
import Grid from '@mui/material/Grid2'
import { useQuery } from '@tanstack/react-query'
import { generateAnalyticsSnapshot, type AnalyticsFilter } from '../services/analyticsService'
import MetricCard from '../components/MetricCard'

export default function AnalyticsDashboardPage() {
  // Filter state is applied on click; fed into the query key so changing it
  // triggers a fresh fetch via react-query (and any invalidate.actions/entries
  // mutation in the app re-runs the snapshot too via the 'analytics' key prefix).
  const [appliedFilter, setAppliedFilter] = useState<AnalyticsFilter>({})
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [filtersOpen, setFiltersOpen] = useState(!isMobile)

  const snapshotQ = useQuery({
    queryKey: ['analytics', 'snapshot', appliedFilter],
    queryFn: () => generateAnalyticsSnapshot(appliedFilter),
  })
  const snapshot = snapshotQ.data ?? null
  const loading = snapshotQ.isLoading
  const error = snapshotQ.error ? (snapshotQ.error as Error).message : null

  function handleApplyFilters() {
    const next: AnalyticsFilter = {}
    if (startDate) next.startDate = startDate
    if (endDate) next.endDate = endDate
    setAppliedFilter(next)
  }

  if (loading && !snapshot) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  if (error && !snapshot) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  if (!snapshot) {
    return (
      <Box p={2}>
        <Alert severity="info">No analytics data available yet. Add entries with recorded outcomes to see performance analytics.</Alert>
      </Box>
    )
  }

  const metrics = snapshot.metrics

  return (
    <Box>
      {/* Filters — collapsed into a button on mobile */}
      <Paper sx={{ p: { xs: 1, sm: 2 }, mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <Button
            size="small"
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen((v) => !v)}
            sx={{ textTransform: 'none', display: { xs: 'flex', sm: 'none' } }}
          >
            Filters{startDate || endDate ? ' (active)' : ''}
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
            {snapshot.filteredCount} of {snapshot.totalCount} outcomes
          </Typography>
        </Box>
        <Collapse in={filtersOpen || !isMobile}>
          <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="flex-end" sx={{ mt: { xs: 1, sm: 0 } }}>
            <TextField
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ flex: { xs: '1 1 48%', sm: 'none' } }}
            />
            <TextField
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ flex: { xs: '1 1 48%', sm: 'none' } }}
            />
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', sm: 'none' } }}>
              <Button variant="contained" size="small" onClick={handleApplyFilters} sx={{ flex: { xs: 1, sm: 'none' } }}>
                Apply
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
                sx={{ flex: { xs: 1, sm: 'none' } }}
              >
                Clear
              </Button>
              {isMobile && (
                <IconButton size="small" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Key Metrics Grid — count-based only, no dollar amounts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          <MetricCard label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} trend={metrics.winRate > 60 ? 'positive' : metrics.winRate < 40 ? 'negative' : null} />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          <MetricCard label="Total Decisions" value={metrics.totalTrades} />
        </Grid>
      </Grid>

      {/* Process Quality vs Outcome Quality matrix — count-based, no dollar amounts */}
      {snapshot.processOutcomeMatrix.some((q) => q.count > 0) && (
        <>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Process Quality vs Outcome Quality
          </Typography>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Process / Outcome</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Good Outcome</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Bad Outcome</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {['good', 'bad'].map((processQ) => {
                  const goodRow = snapshot.processOutcomeMatrix.find((q) => q.processQuality === processQ && q.outcomeQuality === 'good')
                  const badRow = snapshot.processOutcomeMatrix.find((q) => q.processQuality === processQ && q.outcomeQuality === 'bad')
                  return (
                    <TableRow key={processQ}>
                      <TableCell sx={{ fontWeight: 500 }}>{processQ === 'good' ? 'Good Process' : 'Bad Process'}</TableCell>
                      <TableCell align="center">{goodRow?.count || 0} ({goodRow?.percentage.toFixed(1) || 0}%)</TableCell>
                      <TableCell align="center">{badRow?.count || 0} ({badRow?.percentage.toFixed(1) || 0}%)</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  )
}
