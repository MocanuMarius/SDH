import { useEffect, useState, useMemo } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Link,
  Breadcrumbs,
  Stack,
} from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import ValuationWidget from '../components/ValuationWidget'
import { listActions, type ActionWithEntry } from '../services/actionsService'
import { fetchChartData } from '../services/chartApiService'
import TickerLinks from '../components/TickerLinks'
import TickerTimelineChart from '../components/TickerTimelineChart'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { getEntryDisplayTitle, isAutomatedEntry } from '../utils/entryTitle'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from '../components/OptionTypeChip'
import {
  computeCagrFromChart,
  formatCagrPercent,
  formatDurationSince,
  getPctChangeBetween,
  formatDeltaPercent,
} from '../utils/cagr'
import type { ChartRange } from '../services/chartApiService'

/** Pick the best chart range to show all decisions with padding before first and after last */
function bestRangeForActions(actions: ActionWithEntry[]): ChartRange {
  if (actions.length === 0) return '1y'
  const dates = actions.map((a) => a.action_date).sort()
  const firstMs = new Date(dates[0]).getTime()
  const todayMs = Date.now()
  const spanDays = (todayMs - firstMs) / (1000 * 60 * 60 * 24)
  // Add ~20% padding before first decision
  const totalDays = spanDays * 1.2 + 60
  if (totalDays <= 35) return '1m'
  if (totalDays <= 100) return '3m'
  if (totalDays <= 200) return '6m'
  if (totalDays <= 400) return '1y'
  if (totalDays <= 800) return '2y'
  if (totalDays <= 1200) return '3y'
  if (totalDays <= 2000) return '5y'
  return 'max'
}

export default function IdeaDetailPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const chartHeight = isMobile ? 280 : 380
  const [actions, setActions] = useState<ActionWithEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartData, setChartData] = useState<{ dates: string[]; prices: number[] } | null>(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [counterfactual, setCounterfactual] = useState<{
    totalReturnPct: number | null
    hypotheticalEnd: number | null
    cagr: number | null
    loading: boolean
  }>({ totalReturnPct: null, hypotheticalEnd: null, cagr: null, loading: false })

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    const companyKey = normalizeTickerToCompany(decodeURIComponent(ticker))
    listActions({ limit: 500 })
      .then((data) => {
        if (!cancelled && companyKey) {
          const forCompany = (data || []).filter((a) =>
            normalizeTickerToCompany(a.ticker) === companyKey &&
            !(a.entry && isAutomatedEntry(a.entry as { tags: string[]; author: string }))
          )
          setActions(forCompany)
        } else if (!cancelled) {
          setActions([])
          setError(`Invalid ticker: ${ticker}`)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [ticker])

  const passActions = useMemo(() => actions.filter((a) => a.type === 'pass'), [actions])
  const firstPassDate = useMemo(
    () => passActions.length > 0
      ? passActions.reduce((min, a) => (a.action_date < min ? a.action_date : min), passActions[0].action_date)
      : null,
    [passActions]
  )

  const autoRange = useMemo(() => bestRangeForActions(actions), [actions])

  useEffect(() => {
    if (!ticker || actions.length === 0) {
      setChartData(null)
      setChartLoading(false)
      setCounterfactual((c) => ({ ...c, loading: false }))
      return
    }
    let cancelled = false
    setChartLoading(true)
    setChartError(null)
    setCounterfactual((c) => ({ ...c, loading: true }))
    fetchChartData(decodeURIComponent(ticker), autoRange)
      .then((chart) => {
        if (cancelled) return
        setChartData({ dates: chart.dates, prices: chart.prices })
        if (firstPassDate) {
          const cagr = computeCagrFromChart(chart.dates, chart.prices, firstPassDate)
          setCounterfactual({ totalReturnPct: null, hypotheticalEnd: null, cagr, loading: false })
        } else {
          setCounterfactual((c) => ({ ...c, loading: false }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChartData(null)
          setChartError('Chart data unavailable — deltas and counterfactual P&L cannot be calculated.')
          setCounterfactual((c) => ({ ...c, loading: false }))
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false)
      })
    return () => { cancelled = true }
    // `actions.length` is intentionally not a dep: we only want to refetch the
    // chart when the ticker or the time range changes, not every time the
    // actions array re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, firstPassDate, autoRange])

  // Hooks must be called in the same order every render — compute actionDeltas
  // BEFORE any early returns. A null ticker simply yields an empty map.
  const actionDeltas = useMemo(() => {
    if (!ticker) return {} as Record<string, number | null>
    if (!chartData?.dates?.length || !chartData?.prices?.length) return {} as Record<string, number | null>
    const sorted = [...actions].sort((a, b) => (a.action_date || '').localeCompare(b.action_date || ''))
    const out: Record<string, number | null> = {}
    for (let i = 0; i < sorted.length; i++) {
      const action = sorted[i]
      const toDate = i < sorted.length - 1 ? sorted[i + 1].action_date : null
      out[action.id] = getPctChangeBetween(
        chartData.dates,
        chartData.prices,
        action.action_date || '',
        toDate
      )
    }
    return out
  }, [chartData, actions, ticker])

  if (!ticker) {
    return (
      <Alert severity="info">No ticker selected. Go to Ideas and click a ticker.</Alert>
    )
  }

  const company = actions[0]?.company_name ?? ''
  const decodedTicker = decodeURIComponent(ticker)

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        <Button component={RouterLink} to="/ideas" sx={{ mt: 2 }}>Back to Ideas</Button>
      </Box>
    )
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.85rem' }}>
        <Link component={RouterLink} to="/ideas" underline="hover" color="inherit">
          Ideas
        </Link>
        <Typography fontSize="inherit" color="text.primary">
          ${decodedTicker}
        </Typography>
      </Breadcrumbs>
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Chip
          label={`$${decodedTicker}`}
          sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}
        />
        {company && (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: { xs: '60vw', sm: 'none' } }}>
            {company}
          </Typography>
        )}
      </Box>
      {passActions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Counterfactual: since you passed
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span" display="block" sx={{ mb: 0.5 }}>
            You passed on {passActions.length === 1 ? (
              <RelativeDate date={passActions[0].action_date} variant="body2" sx={{ color: 'inherit' }} />
            ) : (
              passActions.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <RelativeDate date={a.action_date} variant="body2" sx={{ color: 'inherit' }} />
                </span>
              ))
            )}. Chart below shows how ${decodedTicker} performed since then.
          </Typography>
          {counterfactual.loading && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CircularProgress size={14} /> Computing impact…
            </Typography>
          )}
          {!counterfactual.loading && counterfactual.cagr != null && firstPassDate && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              If you had bought ({formatDurationSince(firstPassDate)} ago), you would have had{' '}
              <Box component="span" sx={{ color: counterfactual.cagr >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                {formatCagrPercent(counterfactual.cagr)} CAGR
              </Box>
              .
            </Typography>
          )}
          {!counterfactual.loading && counterfactual.cagr == null && firstPassDate && (
            <Typography variant="body2" color="text.secondary">
              Could not compute hypothetical return (chart data may not cover the pass date).
            </Typography>
          )}
          {passActions.some((a) => a.reason?.trim()) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
              Your reason: <TickerLinks text={passActions.find((a) => a.reason?.trim())?.reason ?? ''} variant="chip" dense />
            </Typography>
          )}
        </Paper>
      )}

      <Box sx={{ width: '100%', overflow: 'hidden', mb: 1 }}>
        <TickerTimelineChart symbol={decodedTicker} actions={actions} companyName={company} height={chartHeight} defaultRange={autoRange} />
      </Box>

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Link
          component={RouterLink}
          to={`/timeline?symbol=${encodeURIComponent(decodedTicker)}`}
          variant="body2"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
        >
          <TimelineIcon sx={{ fontSize: 18 }} />
          Full timeline (zoom & filters)
        </Link>
      </Box>

      {chartError && (
        <Alert severity="warning" sx={{ mb: 2 }}>{chartError}</Alert>
      )}

      {/* Valuation widget — per-ticker, uses the first entry's data */}
      {actions[0]?.entry?.id && <ValuationWidget entryId={actions[0].entry.id} hideWhenEmpty />}

      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Decisions ({actions.length})
      </Typography>
      {actions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No decisions for this ticker yet.
          </Typography>
        </Paper>
      ) : isMobile ? (
        /* Mobile: card layout instead of table */
        <Stack spacing={1}>
          {actions.map((a) => {
            const delta = actionDeltas[a.id]
            const hasDelta = delta != null && Number.isFinite(delta)
            return (
              <Paper key={a.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <DecisionChip type={a.type} size="small" />
                  <OptionTypeChip ticker={a.ticker} />
                  {a.price && (
                    <Typography variant="body2" fontWeight={600}>
                      {a.price}{a.currency ? ` ${a.currency}` : ''}
                    </Typography>
                  )}
                  {chartLoading ? null : hasDelta ? (
                    <Typography variant="body2" sx={{ color: delta >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {formatDeltaPercent(delta)}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    <RelativeDate date={a.action_date} variant="caption" sx={{ color: 'inherit' }} />
                  </Typography>
                </Box>
                {a.reason && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    <TickerLinks text={a.reason} variant="chip" dense />
                  </Typography>
                )}
                {a.entry && (
                  <Button
                    component={RouterLink}
                    to={`/entries/${a.entry.id}`}
                    size="small"
                    sx={{ textTransform: 'none', px: 0, fontSize: '0.75rem' }}
                  >
                    {getEntryDisplayTitle(a.entry, [a]).slice(0, 50)}
                    {getEntryDisplayTitle(a.entry, [a]).length > 50 ? '…' : ''}
                  </Button>
                )}
              </Paper>
            )
          })}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Ticker</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Δ</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Entry</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {actions.map((a) => {
                const delta = actionDeltas[a.id]
                const hasDelta = delta != null && Number.isFinite(delta)
                return (
                <TableRow key={a.id}>
                  <TableCell><DecisionChip type={a.type} size="small" /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      {a.ticker ? getTickerDisplayLabel(a.ticker) || `$${a.ticker}` : '—'}
                      <OptionTypeChip ticker={a.ticker} />
                    </Box>
                  </TableCell>
                  <TableCell><RelativeDate date={a.action_date} /></TableCell>
                  <TableCell>
                    {a.price}
                    {a.currency ? ` ${a.currency}` : ''}
                  </TableCell>
                  <TableCell>
                    {chartLoading ? '…' : hasDelta ? (
                      <Box component="span" sx={{ color: delta >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {formatDeltaPercent(delta)}
                      </Box>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{a.reason ? <TickerLinks text={a.reason} variant="chip" dense /> : '—'}</TableCell>
                  <TableCell>
                    {a.entry ? (
                      <Button
                        component={RouterLink}
                        to={`/entries/${a.entry.id}`}
                        size="small"
                        sx={{ textTransform: 'none' }}
                      >
                        {getEntryDisplayTitle(a.entry, [a]).slice(0, 40)}
                        {getEntryDisplayTitle(a.entry, [a]).length > 40 ? '…' : ''}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}
