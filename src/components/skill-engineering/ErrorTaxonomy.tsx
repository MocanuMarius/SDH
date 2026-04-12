import { Box, Card, CardContent, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Alert, Chip, Stack } from '@mui/material'
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { ERROR_TYPES, ErrorType } from '../../types/database'

interface ErrorStats {
  type: ErrorType
  count: number
  percentage: number
  examples: string[]
}

export default function ErrorTaxonomy() {
  const { user } = useAuth()
  const [errorStats, setErrorStats] = useState<ErrorStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadErrorData()
  }, [user])

  const loadErrorData = async () => {
    try {
      // Get all outcomes with error types
      const { data: outcomes, error: outcomeError } = await supabase
        .from('outcomes')
        .select(
          `
          id,
          error_type,
          action_id,
          actions(
            ticker,
            type,
            reason
          )
        `
        )
        .not('error_type', 'is', null)

      if (outcomeError) throw outcomeError

      // Count errors by type
      const errorCounts: { [key in ErrorType]: { count: number; examples: string[] } } = {
        analytical: { count: 0, examples: [] },
        informational: { count: 0, examples: [] },
        behavioral: { count: 0, examples: [] },
        sizing: { count: 0, examples: [] },
        timing: { count: 0, examples: [] },
      }

      outcomes.forEach((outcome) => {
        const types = outcome.error_type as ErrorType[] | null
        if (types && Array.isArray(types)) {
          types.forEach((type) => {
            if (type in errorCounts) {
              errorCounts[type].count++
              const action = Array.isArray(outcome.actions) ? outcome.actions[0] : outcome.actions
              const ticker = action?.ticker || 'Unknown'
              const actionType = action?.type || 'unknown'
              const example = `${ticker} (${actionType})`
              if (errorCounts[type].examples.length < 3) {
                errorCounts[type].examples.push(example)
              }
            }
          })
        }
      })

      const total = Object.values(errorCounts).reduce((sum, e) => sum + e.count, 0)

      const stats: ErrorStats[] = ERROR_TYPES.map((type) => ({
        type,
        count: errorCounts[type].count,
        percentage: total > 0 ? Math.round((errorCounts[type].count / total) * 100) : 0,
        examples: errorCounts[type].examples,
      }))

      setErrorStats(stats.sort((a, b) => b.count - a.count))
    } catch (error) {
      console.error('Error loading error data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getErrorDescription = (type: ErrorType): string => {
    const descriptions: Record<ErrorType, string> = {
      analytical: 'Wrong model or analysis of business fundamentals',
      informational: 'Missing key data or facts at the time of decision',
      behavioral: 'Emotional override, FOMO, fear, or ego-driven decision',
      sizing: 'Right thesis but wrong position size (too large/small)',
      timing: 'Right thesis but too early or too late',
    }
    return descriptions[type]
  }

  if (loading) {
    return <Typography>Loading error taxonomy...</Typography>
  }

  const totalErrors = errorStats.reduce((sum, e) => sum + e.count, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Alert severity="info">
        Categorizing errors reveals your systematic weaknesses. After 30+ decisions, error
        distribution becomes your personal "weakness profile."
      </Alert>

      {totalErrors === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary">
              No errors tagged yet. Tag errors on closed positions to populate this view.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Error Distribution ({totalErrors} total errors)
              </Typography>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Error Type</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Percentage</TableCell>
                      <TableCell>Examples</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {errorStats.map((stat) => (
                      <TableRow key={stat.type}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {stat.type.charAt(0).toUpperCase() + stat.type.slice(1)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {getErrorDescription(stat.type)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{stat.count}</TableCell>
                        <TableCell align="right">
                          <Chip label={`${stat.percentage}%`} size="small" />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                            {stat.examples.map((ex, i) => (
                              <Typography key={i} variant="caption">
                                {ex}
                              </Typography>
                            ))}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Your Top 3 Weaknesses
              </Typography>
              {errorStats.slice(0, 3).map((stat, index) => (
                <Box key={stat.type} sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {index + 1}. {stat.type.charAt(0).toUpperCase() + stat.type.slice(1)} (
                    {stat.count} errors)
                  </Typography>
                  <Typography variant="caption" color="textSecondary" component="div" sx={{ mt: 0.5 }}>
                    {getErrorDescription(stat.type)}
                  </Typography>
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#d9534f' }}>
                    → Focus deliberate practice on this weakness
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Improvement Strategy
              </Typography>
              <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                {`If your top error is ANALYTICAL:
→ Spend more time on financial modeling
→ Study 10 business model failures in your sector
→ Build a checklist of past analytical mistakes

If INFORMATIONAL:
→ Improve research process and checklists
→ Expand information sources
→ Add "what could I be missing?" to pre-mortems

If BEHAVIORAL:
→ Practice forecasting in low-stakes markets
→ Build pre-commitment kill criteria
→ Review positions when losing (not winning)

If SIZING:
→ Study Kelly criterion and position sizing
→ Practice Kelly calculations on past trades
→ Use smaller positions while learning

If TIMING:
→ Define staging plans for entries
→ Study when to average down vs. reassess
→ Practice smaller, earlier exits`}
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
