/**
 * Quick ticker chart popup: price line + SPY benchmark (% normalised) + decision markers.
 * Opened via useTickerChart().openChart(ticker) from anywhere in the app.
 * Auto-fits the date range to encompass all decisions, with padding.
 */

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Dialog, DialogTitle, DialogContent,
  Box, Typography, IconButton, Button, Skeleton, Alert, Divider, Chip,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import { useNavigate } from 'react-router-dom'
import { ParentSize } from '@visx/responsive'
import { listActions, type ActionWithEntry } from '../services/actionsService'
import { fetchChartData, type ChartData } from '../services/chartApiService'
import { getChartCategory } from '../theme/decisionTypes'
import DecisionChip from './DecisionChip'
import TimelineChartVisx, { type TimelineChartPoint } from './TimelineChartVisx'

interface Props {
  ticker: string | null
  onClose: () => void
}

const CHART_H = 380
const BENCHMARK = 'SPY'

function addDays(date: string, n: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toFixed(0)
  if (n >= 100) return n.toFixed(1)
  return n.toFixed(2)
}

function closestChartIndex(
  pairs: { date: string; price: number }[],
  actionDate: string
): number {
  const ms = new Date(actionDate).getTime()
  let bestIdx = 0
  let bestDist = Math.abs(new Date(pairs[0].date).getTime() - ms)
  for (let i = 1; i < pairs.length; i++) {
    const d = Math.abs(new Date(pairs[i].date).getTime() - ms)
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  return bestIdx
}

export default function TickerChartDialog({ ticker, onClose }: Props) {
  const navigate = useNavigate()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [actions, setActions] = useState<ActionWithEntry[]>([])
  const [tickerChartRaw, setTickerChartRaw] = useState<ChartData | null>(null)
  const [benchChartRaw, setBenchChartRaw] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch actions + chart data
  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setActions([])
    setTickerChartRaw(null)
    setBenchChartRaw(null)

    ;(async () => {
      try {
        const acts = await listActions({ ticker })
        if (cancelled) return
        setActions(acts)

        // Compute date range: 60 days before first decision → today, or default 1Y if no decisions
        const today = new Date().toISOString().slice(0, 10)
        let startDate: string
        let range: 'max' | '1y' = 'max'
        if (acts.length > 0) {
          const dates = acts.map((a) => a.action_date).sort()
          startDate = addDays(dates[0], -60)
        } else {
          range = '1y'
          startDate = addDays(today, -365)
        }

        const [tc, bc] = await Promise.all([
          fetchChartData(ticker, range, { startDate, endDate: today }),
          fetchChartData(BENCHMARK, range, { startDate, endDate: today }),
        ])
        if (cancelled) return
        setTickerChartRaw(tc)
        setBenchChartRaw(bc)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chart')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [ticker])

  // Measure container width
  // Build paired price data
  const tickerPairs = useMemo(() => {
    if (!tickerChartRaw) return []
    return tickerChartRaw.dates
      .map((d, i) => ({ date: d, price: tickerChartRaw.prices[i] }))
      .filter((p) => isFinite(p.price) && p.price > 0)
  }, [tickerChartRaw])

  const benchPairs = useMemo(() => {
    if (!benchChartRaw) return []
    return benchChartRaw.dates
      .map((d, i) => ({ date: d, price: benchChartRaw.prices[i] }))
      .filter((p) => isFinite(p.price) && p.price > 0)
  }, [benchChartRaw])

  // Normalise to % from first point
  const normalised = useMemo(() => {
    if (!tickerPairs.length || !benchPairs.length) return null

    const tStart = tickerPairs[0].price
    const bStart = benchPairs[0].price

    const tNorm = tickerPairs.map((p) => ({ date: p.date, pct: (p.price / tStart - 1) * 100 }))
    const bNorm = benchPairs.map((p) => ({ date: p.date, pct: (p.price / bStart - 1) * 100 }))

    const allPcts = [...tNorm, ...bNorm].map((p) => p.pct)
    const minPct = Math.min(...allPcts)
    const maxPct = Math.max(...allPcts)
    const pad = Math.max(3, (maxPct - minPct) * 0.1)

    return {
      ticker: tNorm,
      bench: bNorm,
      yMin: minPct - pad,
      yMax: maxPct + pad,
      finalTickerPct: tNorm[tNorm.length - 1]?.pct ?? 0,
      finalBenchPct: bNorm[bNorm.length - 1]?.pct ?? 0,
    }
  }, [tickerPairs, benchPairs])

  // Build the data shape TimelineChartVisx wants: each price point may carry
  // the decisions whose action_date matches it. Multiple decisions on the
  // same price-day land on the same point and the chart's marker layer
  // clusters / splits them automatically.
  const chartData: TimelineChartPoint[] = useMemo(() => {
    if (!tickerPairs.length) return []
    const decisionsByDate = new Map<string, ActionWithEntry[]>()
    for (const a of actions) {
      const idx = closestChartIndex(tickerPairs, a.action_date)
      const date = tickerPairs[idx]?.date
      if (!date) continue
      const arr = decisionsByDate.get(date) ?? []
      arr.push(a)
      decisionsByDate.set(date, arr)
    }
    return tickerPairs.map((p) => {
      const decs = decisionsByDate.get(p.date)
      return {
        date: p.date,
        price: p.price,
        decisions: decs?.map((a) => ({ action: a, type: getChartCategory(a.type) })),
      }
    })
  }, [tickerPairs, actions])

  // Y-axis domain — raw price range with 5% padding above and below. The
  // chart will further expand it to accommodate the benchmark overlay
  // mapped onto the ticker's price scale.
  const yDomain: [number, number] | null = useMemo(() => {
    if (!tickerPairs.length) return null
    const prices = tickerPairs.map((p) => p.price)
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const span = hi - lo || 1
    return [lo - span * 0.05, hi + span * 0.05]
  }, [tickerPairs])

  const alpha = normalised ? normalised.finalTickerPct - normalised.finalBenchPct : 0
  const company = actions[0]?.company_name ?? ''
  const lastPrice = tickerPairs.length ? tickerPairs[tickerPairs.length - 1].price : null

  return (
    <Dialog
      open={!!ticker}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2, minHeight: fullScreen ? '100vh' : 520 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0, pt: 1.5, px: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>${ticker}</Typography>
          {company && (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
              {company}
            </Typography>
          )}
          {lastPrice != null && (
            <Typography variant="body1" fontWeight={600} sx={{ ml: 1 }}>
              {fmtPrice(lastPrice)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => { navigate(`/timeline?symbol=${ticker ?? ''}`); onClose() }}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Full Timeline
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => { navigate(`/tickers/${encodeURIComponent(ticker ?? '')}`); onClose() }}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Ticker Page
          </Button>
          <IconButton onClick={onClose} size="small" sx={{ ml: 0.5 }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0.5, px: 2.5, pb: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4].map((k) => <Skeleton key={k} variant="rectangular" width={90} height={40} sx={{ borderRadius: 1 }} />)}
            </Box>
            <Skeleton variant="rectangular" height={CHART_H} sx={{ borderRadius: 1 }} />
          </Box>
        )}

        {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}

        {!loading && !error && normalised && svg && (
          <>
            {/* Stats bar */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1, mt: 0.5 }}>
              {actions.length > 0 && (
                <>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                      {ticker} return
                    </Typography>
                    <Typography variant="h6" fontWeight={700} lineHeight={1.2}
                      sx={{ color: normalised.finalTickerPct >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtPct(normalised.finalTickerPct)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                      SPY (same period)
                    </Typography>
                    <Typography variant="h6" fontWeight={600} color="text.secondary" lineHeight={1.2}>
                      {fmtPct(normalised.finalBenchPct)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                      Alpha
                    </Typography>
                    <Typography variant="h6" fontWeight={700} lineHeight={1.2}
                      sx={{ color: alpha >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtPct(alpha)}
                    </Typography>
                  </Box>
                </>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                  Decisions
                </Typography>
                <Typography variant="h6" fontWeight={600} lineHeight={1.2}>{actions.length}</Typography>
              </Box>
            </Box>

            {/* Chart — same TimelineChartVisx as /timeline, just with the
                brush hidden, the click-overlay disabled (we always show the
                benchmark, no need to fetch others), and benchmark passed in
                as data so it appears as a dashed grey overlay line. */}
            <Box sx={{ width: '100%', height: CHART_H, mb: 0.5, position: 'relative' }}>
              {yDomain && chartData.length > 0 && (
                <ParentSize>
                  {({ width: pw, height: ph }) => (pw > 10 && ph > 10) ? (
                    <TimelineChartVisx
                      data={chartData}
                      symbol={ticker ?? ''}
                      yDomain={yDomain}
                      width={pw}
                      height={ph}
                      selectedActionId={null}
                      selectedTicker={null}
                      onSelectAction={() => { /* popup doesn't track selection */ }}
                      onChartClick={() => { /* popup doesn't track background clicks */ }}
                      onMouseLeave={() => { /* popup has no list to clear */ }}
                      showBrush={false}
                      benchmarkData={benchChartRaw ? { ticker: BENCHMARK, dates: benchChartRaw.dates, prices: benchChartRaw.prices } : null}
                      disableMarkerClick
                    />
                  ) : null}
                </ParentSize>
              )}
            </Box>

            {/* Decision list */}
            {actions.length > 0 && (
              <>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                  Decisions ({actions.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 240, overflowY: 'auto' }}>
                  {actions.map((a) => (
                    <Box key={a.id} sx={{
                      display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap',
                      p: 0.75, borderRadius: 1, bgcolor: 'grey.50',
                      '&:hover': { bgcolor: 'grey.100' },
                    }}>
                      <DecisionChip type={a.type} size="small" sx={{ pointerEvents: 'none' }} />
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 86, fontVariantNumeric: 'tabular-nums' }}>
                        {a.action_date}
                      </Typography>
                      {a.price && (
                        <Chip size="small" variant="outlined"
                          label={`${a.currency || '$'}${a.price}`}
                          sx={{ height: 22, fontSize: '0.75rem' }}
                        />
                      )}
                      {a.reason && (
                        <Typography variant="body2" noWrap sx={{ maxWidth: 320, color: 'text.primary' }}>
                          {a.reason}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {actions.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <ShowChartIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
                <Typography variant="body2" color="text.secondary">
                  No decisions logged. Chart shows 1Y price history.
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* Chart not available but actions exist */}
        {!loading && !error && !normalised && actions.length > 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>Chart data unavailable for this ticker.</Alert>
        )}
      </DialogContent>
    </Dialog>
  )
}
