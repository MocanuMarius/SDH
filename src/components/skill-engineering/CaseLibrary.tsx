import { Box, Card, CardContent, Typography, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, Alert } from '@mui/material'
import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

interface CaseStudy {
  id: string
  ticker: string
  type: 'success' | 'failure'
  thesis: string
  outcome: string
  reasoning: string
  keyLessons: string
}

export default function CaseLibrary() {
  const { user } = useAuth()
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCase, setSelectedCase] = useState<CaseStudy | null>(null)
  const [openDialog, setOpenDialog] = useState(false)

  useEffect(() => {
    if (!user) return
    loadCases()
  }, [user])

  const loadCases = async () => {
    try {
      // Get all closed positions with outcomes
      const { data: outcomes, error: outcomeError } = await supabase
        .from('outcomes')
        .select(
          `
          id,
          realized_pnl,
          outcome_date,
          post_mortem_notes,
          process_quality,
          outcome_quality,
          action_id,
          actions(
            ticker,
            type,
            reason,
            entry_id,
            entries(
              title_markdown,
              body_markdown
            )
          )
        `
        )
        .order('outcome_date', { ascending: false })

      if (outcomeError) throw outcomeError

      // Convert to case studies
      const caseStudies: CaseStudy[] = outcomes
        .filter((o) => o.actions && o.action_id)
        .map((o) => {
          const pnl = o.realized_pnl || 0
          const type = pnl > 0 ? 'success' : 'failure'
          // Supabase returns joins as arrays; unwrap single-item arrays
          const action = Array.isArray(o.actions) ? o.actions[0] : o.actions
          const entry = Array.isArray(action?.entries) ? action?.entries[0] : action?.entries

          return {
            id: o.id,
            ticker: action?.ticker || 'Unknown',
            type,
            thesis: entry?.title_markdown || action?.reason || 'No title',
            outcome: `${type === 'success' ? 'Profitable' : 'Loss'} (P&L: $${pnl.toLocaleString()})`,
            reasoning: action?.reason || 'No reason recorded',
            keyLessons: o.post_mortem_notes || 'No post-mortem',
          }
        })

      setCases(caseStudies)
    } catch (error) {
      console.error('Error loading cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCase = (c: CaseStudy) => {
    setSelectedCase(c)
    setOpenDialog(true)
  }

  const handleCloseDialog = () => {
    setOpenDialog(false)
    setSelectedCase(null)
  }

  const successCount = cases.filter((c) => c.type === 'success').length
  const failureCount = cases.filter((c) => c.type === 'failure').length

  if (loading) {
    return <Typography>Loading case library...</Typography>
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Alert severity="info">
        Study successes AND failures equally. Survivorship bias is severe: we always study Buffett's
        wins, but not the hundreds who used other methods and failed. Your failures contain the
        highest-density learning signal.
      </Alert>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Case Library Overview
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" variant="caption">
                  Successes
                </Typography>
                <Typography variant="h5">{successCount}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" variant="caption">
                  Failures
                </Typography>
                <Typography variant="h5">{failureCount}</Typography>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" variant="caption">
                  Success Rate
                </Typography>
                <Typography variant="h5">
                  {cases.length > 0 ? Math.round((successCount / cases.length) * 100) : 0}%
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          {successCount + failureCount > 0 ? (
            <Typography variant="body2" sx={{ mb: 3 }}>
              You have {successCount + failureCount} closed positions. For maximum learning,
              allocate equal study time to both successes and failures.
            </Typography>
          ) : (
            <Typography variant="body2" color="textSecondary">
              Close some positions and record outcomes to populate this library.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Stack spacing={2}>
        {cases.length === 0 ? (
          <Card>
            <CardContent>
              <Typography color="textSecondary">
                No closed positions yet. Close a position and record an outcome to start building
                your case library.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Successes ({successCount})
              </Typography>
              <Stack spacing={1}>
                {cases
                  .filter((c) => c.type === 'success')
                  .slice(0, 5)
                  .map((c) => (
                    <Card key={c.id} variant="outlined">
                      <CardContent sx={{ pb: '12px !important' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2">{c.ticker}</Typography>
                            <Typography variant="body2" color="textSecondary">
                              {c.thesis}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                              <span style={{ color: 'green', fontWeight: 600 }}>✓ {c.outcome}</span>
                            </Typography>
                          </Box>
                          <Button size="small" onClick={() => handleOpenCase(c)}>
                            Review
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Failures ({failureCount})
              </Typography>
              <Stack spacing={1}>
                {cases
                  .filter((c) => c.type === 'failure')
                  .slice(0, 5)
                  .map((c) => (
                    <Card key={c.id} variant="outlined" sx={{ borderColor: '#f5222d' }}>
                      <CardContent sx={{ pb: '12px !important' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2">{c.ticker}</Typography>
                            <Typography variant="body2" color="textSecondary">
                              {c.thesis}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                              <span style={{ color: '#d9534f', fontWeight: 600 }}>✗ {c.outcome}</span>
                            </Typography>
                          </Box>
                          <Button size="small" onClick={() => handleOpenCase(c)}>
                            Review
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
              </Stack>
            </Box>
          </>
        )}
      </Stack>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        {selectedCase && (
          <>
            <DialogTitle>
              {selectedCase.ticker} - {selectedCase.type === 'success' ? '✓' : '✗'} Case Study
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    THESIS
                  </Typography>
                  <Typography variant="body2">{selectedCase.thesis}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    OUTCOME
                  </Typography>
                  <Typography variant="body2">{selectedCase.outcome}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    REASONING
                  </Typography>
                  <Typography variant="body2">{selectedCase.reasoning}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    KEY LESSONS
                  </Typography>
                  <Typography variant="body2">{selectedCase.keyLessons}</Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            How to Use This Library
          </Typography>
          <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
            {`1. Study patterns across failures to build an error-prevention checklist
2. Compare similar decision types (e.g., "turnaround plays") across cases
3. Look for repeated mistakes (analytical, informational, behavioral, sizing, timing)
4. Build "if I see X again, I will..." rules based on failure patterns
5. Allocate equal time to both wins and losses

Key insight from Tetlock/Kahneman:
Experts improve by studying failure patterns more intensively than successes.
Success can be luck; failure teaches process quality.`}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
