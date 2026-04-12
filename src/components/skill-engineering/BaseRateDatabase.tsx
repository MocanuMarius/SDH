import { Box, Card, CardContent, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Alert, Chip } from '@mui/material'
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

interface BaseRatePattern {
  pattern: string
  predictions: number
  successRate: number
  recentExamples: string[]
}

export default function BaseRateDatabase() {
  const { user } = useAuth()
  const [baseRates, setBaseRates] = useState<BaseRatePattern[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadBaseRates()
  }, [user])

  const loadBaseRates = async () => {
    try {
      // Get all actions grouped by common patterns/themes
      const { data: actions, error: actionError } = await supabase
        .from('actions')
        .select(
          `
          id,
          type,
          ticker,
          reason,
          entry_id,
          entries(
            tags
          ),
          outcomes(
            realized_pnl,
            process_quality,
            outcome_quality
          )
        `
        )
        .order('created_at', { ascending: false })

      if (actionError) throw actionError

      // Build base rate patterns from common themes in reasons/tags
      const patterns: { [key: string]: { count: number; success: number; examples: string[] } } =
        {}

      actions.forEach((action) => {
        // Extract patterns from reason text
        const reason = action.reason?.toLowerCase() || ''
        const type = action.type

        // Build simple pattern keys (in a real system, you'd use NLP or manual categorization)
        const patternKey = `${type.toUpperCase()} - ${reason.split(' ').slice(0, 2).join(' ')}`

        if (!patterns[patternKey]) {
          patterns[patternKey] = { count: 0, success: 0, examples: [] }
        }

        patterns[patternKey].count++

        // Count as success if outcome was good
        const hasGoodOutcome = action.outcomes?.some((o) => (o.realized_pnl || 0) > 0)
        if (hasGoodOutcome) {
          patterns[patternKey].success++
        }

        const example = `${action.ticker} (${action.reason?.slice(0, 30)}...)`
        if (patterns[patternKey].examples.length < 2) {
          patterns[patternKey].examples.push(example)
        }
      })

      // Convert to display format
      const baseRateList: BaseRatePattern[] = Object.entries(patterns)
        .map(([pattern, data]) => ({
          pattern,
          predictions: data.count,
          successRate: data.count > 0 ? Math.round((data.success / data.count) * 100) : 0,
          recentExamples: data.examples,
        }))
        .sort((a, b) => b.predictions - a.predictions)

      setBaseRates(baseRateList)
    } catch (error) {
      console.error('Error loading base rates:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Typography>Loading base rates...</Typography>
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Alert severity="info">
        Your personal base rate database: historical success rates by decision type. If you predict
        "20%+ revenue growth," what's your actual track record?
      </Alert>

      {baseRates.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary">
              Base rates will populate after you record outcomes on closed positions.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Decision Type Success Rates
              </Typography>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>Decision Pattern</TableCell>
                      <TableCell align="right">Times Made</TableCell>
                      <TableCell align="right">Success Rate</TableCell>
                      <TableCell>Recent Examples</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {baseRates.map((rate) => (
                      <TableRow key={rate.pattern}>
                        <TableCell>{rate.pattern}</TableCell>
                        <TableCell align="right">{rate.predictions}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${rate.successRate}%`}
                            color={rate.successRate > 60 ? 'success' : rate.successRate > 40 ? 'warning' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {rate.recentExamples.map((ex, i) => (
                            <Typography key={i} variant="caption" display="block">
                              • {ex}
                            </Typography>
                          ))}
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
                How to Build This
              </Typography>
              <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                {`1. Systematically categorize your reasons ("growth thesis", "turnaround play", "dividend", etc.)
2. After each outcome, record realized P&L and success/failure
3. Group outcomes by reason category to find patterns
4. Identify which decision types you execute well vs. poorly
5. Restrict or improve decisions in low-success categories

Example:
"If my 'dividend harvest' picks succeed 80% of the time, I should
do more of those. If my 'growth at reasonable price' picks succeed
only 35%, I should reassess my process or avoid that category."`}
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  )
}
