import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import { useQuery } from '@tanstack/react-query'
import { calculatePredictionCalibration } from '../services/analyticsService'

export default function CalibrationDashboardPage() {
  // Wired to react-query so the page reflects new predictions / outcomes the
  // moment they're added — the global `['analytics']` invalidation reaches us.
  const calQ = useQuery({
    queryKey: ['analytics', 'calibration'],
    queryFn: () => calculatePredictionCalibration(),
  })
  const snapshot = calQ.data ?? null
  const loading = calQ.isLoading
  const error = calQ.error ? (calQ.error as Error).message : null

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

  if (!snapshot) return null

  const biasColor = snapshot.biasSummary === 'overconfident' ? 'error' : snapshot.biasSummary === 'underconfident' ? 'warning' : 'success'
  const biasEmoji = snapshot.biasSummary === 'overconfident' ? '' : snapshot.biasSummary === 'underconfident' ? '' : ''

  return (
    <Box>

      {/* Overall Accuracy Card */}
      <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box flex={1}>
              <Typography color="textSecondary" gutterBottom>
                Overall Directional Accuracy
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: snapshot.totalPredictions === 0 ? 'text.secondary' : 'success.main' }}>
                {snapshot.totalPredictions === 0 ? '—' : `${snapshot.overallAccuracy.toFixed(1)}%`}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {snapshot.totalPredictions === 0
                  ? 'No resolved predictions yet'
                  : `${snapshot.totalPredictions} resolved prediction${snapshot.totalPredictions === 1 ? '' : 's'} analyzed`}
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: 'action.selected',
                fontWeight: 700,
                fontSize: '2rem',
              }}
            >
              {snapshot.totalPredictions === 0 ? '' : snapshot.overallAccuracy > 60 ? '' : snapshot.overallAccuracy > 50 ? '' : ''}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Calibration Status Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            {biasEmoji} Calibration Status: {snapshot.biasSummary ? snapshot.biasSummary.charAt(0).toUpperCase() + snapshot.biasSummary.slice(1) : 'No data'}
          </Typography>
          {snapshot.biasSummary && <Chip label={snapshot.biasSummary} color={biasColor} size="small" sx={{ mb: 2 }} />}

          {snapshot.biasSummary === 'overconfident' && (
            <Alert severity="warning" icon={<InfoIcon />} sx={{ mt: 1 }}>
              Your directional accuracy is <strong>below 50%</strong> — your predictions have been contrarian to the market. The opposite direction has historically been more accurate.
            </Alert>
          )}
          {snapshot.biasSummary === 'underconfident' && (
            <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 1 }}>
              You tend to be <strong>underconfident</strong>. You're actually better than you think! Consider being slightly bolder in your convictions.
            </Alert>
          )}
          {snapshot.biasSummary === 'well-calibrated' && (
            <Alert severity="success" icon={<InfoIcon />} sx={{ mt: 1 }}>
              {snapshot.totalPredictions === 0
                ? 'No resolved predictions yet. Add return % predictions when creating entries, then record outcomes to start tracking accuracy.'
                : <><strong>Good directional accuracy!</strong> You are correctly predicting market direction more than half the time.</>
              }
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Calibration by Confidence Bin */}
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
        Directional Accuracy by Predicted Return Range
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>Predicted Return</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Predictions
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Correct Dir.
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Dir. Accuracy
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>
                vs 50% (Edge)
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                Signal
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {snapshot.bins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No prediction data yet. Add entries with return % predictions to see calibration by range.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              snapshot.bins.map((bin) => {
                const isEmpty = bin.totalPredictions === 0
                const isNeutral = Math.abs(bin.calibration) < 5
                const emoji = isEmpty ? '—' : isNeutral ? '' : bin.calibration > 5 ? 'Skill' : 'Anti'

                return (
                  <TableRow key={bin.confidenceRange} sx={{ opacity: isEmpty ? 0.4 : 1 }}>
                    <TableCell sx={{ fontWeight: 500 }}>{bin.confidenceRange}</TableCell>
                    <TableCell align="right">{bin.totalPredictions}</TableCell>
                    <TableCell align="right">{isEmpty ? '—' : bin.correctPredictions}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: isEmpty ? 'text.disabled' : bin.accuracy > 60 ? '#16a34a' : bin.accuracy > 50 ? '#f59e0b' : '#dc2626',
                        fontWeight: 600,
                      }}
                    >
                      {isEmpty ? '—' : `${bin.accuracy.toFixed(0)}%`}
                    </TableCell>
                    <TableCell align="center">
                      {isEmpty ? (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, Math.abs(bin.calibration) * 2)}
                            color={bin.calibration > 0 ? 'success' : 'error'}
                            sx={{ flex: 1, minWidth: 60 }}
                          />
                          <Typography variant="body2" sx={{ minWidth: 45, textAlign: 'right', color: bin.calibration > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            {bin.calibration > 0 ? '+' : ''}
                            {bin.calibration.toFixed(1)}%
                          </Typography>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="center">{emoji}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Recommendations */}
      {snapshot.recommendations.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Recommendations
          </Typography>
          <Paper sx={{ p: 2, mb: 3 }}>
            {snapshot.recommendations.map((rec, idx) => (
              <Box key={idx} sx={{ mb: idx < snapshot.recommendations.length - 1 ? 1.5 : 0, display: 'flex', gap: 1 }}>
                <Box sx={{ color: 'primary.main', fontWeight: 600, minWidth: 24 }}>→</Box>
                <Typography variant="body2">{rec}</Typography>
              </Box>
            ))}
          </Paper>
        </>
      )}

      {/* Interpretation Guide */}
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.light' }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          📖 How to Interpret
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          <strong>Directional Accuracy:</strong> Did the market move in the direction you predicted?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          <strong>Calibration vs 50%:</strong> How much better (or worse) than a coin flip are you?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          • <strong>Positive:</strong> You have skill — your predictions beat random chance in this range
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          • <strong>Negative:</strong> Your predictions in this range are contrarian — the opposite direction has been more accurate
        </Typography>
        <Typography variant="body2" color="text.secondary">
          • <strong>Near zero:</strong> No edge detected yet — keep adding predictions to build a larger sample
        </Typography>
      </Paper>
    </Box>
  )
}
