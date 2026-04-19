/**
 * ClosedDecisionsQuality — the two genuinely useful widgets that used to live
 * on the Analytics "Overview" tab:
 *
 *   - Win Rate + Total closed decisions (count-based, no dollar amounts)
 *   - Process Quality × Outcome Quality matrix (2×2)
 *
 * Shown at the top of the Performance tab so users see closed-trade quality
 * next to the rest of their activity instead of flipping between tabs.
 * Hides itself entirely when there are zero closed outcomes — nothing to
 * say yet.
 *
 * Draws from `generateAnalyticsSnapshot()` which still filters out
 * option tickers (broker-import filtering retired alongside the
 * import surface).
 */
import { useQuery } from '@tanstack/react-query'
import { Box, Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow, Skeleton } from '@mui/material'
import Grid from '@mui/material/Grid2'
import { MetricTile } from './system'
import { generateAnalyticsSnapshot } from '../services/analyticsService'

export default function ClosedDecisionsQuality() {
  const snapshotQ = useQuery({
    queryKey: ['analytics', 'snapshot', {}],
    queryFn: () => generateAnalyticsSnapshot({}),
  })

  if (snapshotQ.isLoading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 4 }}><Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} /></Grid>
          <Grid size={{ xs: 6, sm: 4 }}><Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} /></Grid>
        </Grid>
      </Box>
    )
  }

  const snapshot = snapshotQ.data
  if (!snapshot || snapshot.metrics.totalTrades === 0) return null

  const { metrics, processOutcomeMatrix } = snapshot
  const hasMatrix = processOutcomeMatrix.some((q) => q.count > 0)

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Closed decisions only ({metrics.totalTrades} with recorded outcomes).
      </Typography>

      {/* Win Rate + Total tiles */}
      <Grid container spacing={2} sx={{ mb: hasMatrix ? 2 : 0 }}>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          <MetricTile
            label="Win Rate"
            value={`${metrics.winRate.toFixed(1)}%`}
            tone={metrics.winRate > 60 ? 'positive' : metrics.winRate < 40 ? 'negative' : 'default'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 4 }}>
          <MetricTile label="Closed" value={metrics.totalTrades} />
        </Grid>
      </Grid>

      {/* Process × Outcome 2×2 — only when there's data to plot */}
      {hasMatrix && (
        <Paper variant="outlined" sx={{ p: 2, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Process × Outcome
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Was the decision process good (homework, thesis) — and did the outcome work? Ideally most counts sit on the "Good Process" row.
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Process / Outcome</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Good Outcome</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Bad Outcome</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(['good', 'bad'] as const).map((processQ) => {
                const goodRow = processOutcomeMatrix.find((q) => q.processQuality === processQ && q.outcomeQuality === 'good')
                const badRow = processOutcomeMatrix.find((q) => q.processQuality === processQ && q.outcomeQuality === 'bad')
                return (
                  <TableRow key={processQ}>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {processQ === 'good' ? 'Good Process' : 'Bad Process'}
                    </TableCell>
                    <TableCell align="center">{goodRow?.count ?? 0} ({(goodRow?.percentage ?? 0).toFixed(1)}%)</TableCell>
                    <TableCell align="center">{badRow?.count ?? 0} ({(badRow?.percentage ?? 0).toFixed(1)}%)</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  )
}
