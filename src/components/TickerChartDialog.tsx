/**
 * Quick ticker chart popup: price line + SPY benchmark (% normalised) + decision markers.
 * Opened via useTickerChart().openChart(ticker) from anywhere in the app.
 * Auto-fits the date range to encompass all decisions, with padding.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { scaleTime, scaleLinear } from '@visx/scale'
import { listActions, type ActionWithEntry } from '../services/actionsService'
import { fetchChartData, type ChartData } from '../services/chartApiService'
import { getDecisionTypeColor, getChartCategory } from '../theme/decisionTypes'
import DecisionChip from './DecisionChip'

interface Props {
  ticker: string | null
  onClose: () => void
}

const CHART_H = 380
const M = { top: 20, right: 20, bottom: 32, left: 58 }
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

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function fmtDateAxis(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(700)
  // Tooltip: index into ticker chart
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Fetch actions + chart data
  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setActions([])
    setTickerChartRaw(null)
    setBenchChartRaw(null)
    setHoverIdx(null)

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
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      if (width > 0) setCw(Math.round(width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  // Decision markers
  const markers = useMemo(() => {
    if (!tickerPairs.length || !normalised) return []
    const tStart = tickerPairs[0].price
    return actions.map((a) => {
      const idx = closestChartIndex(tickerPairs, a.action_date)
      const p = tickerPairs[idx]
      return {
        action: a,
        date: p.date,
        idx,
        pct: (p.price / tStart - 1) * 100,
        price: p.price,
        category: getChartCategory(a.type),
        color: getDecisionTypeColor(a.type),
      }
    })
  }, [tickerPairs, normalised, actions])

  // SVG geometry
  const svg = useMemo(() => {
    if (!normalised) return null
    const innerW = Math.max(0, cw - M.left - M.right)
    const innerH = Math.max(0, CHART_H - M.top - M.bottom)

    const allDates = normalised.ticker.map((p) => new Date(p.date))
    if (!allDates.length) return null
    const xScale = scaleTime({
      domain: [allDates[0], allDates[allDates.length - 1]],
      range: [0, innerW],
    })
    const yScale = scaleLinear({
      domain: [normalised.yMin, normalised.yMax],
      range: [innerH, 0],
    })

    const toPath = (pts: { date: string; pct: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(new Date(p.date))},${yScale(p.pct)}`).join(' ')

    // Grid lines
    const yRange = normalised.yMax - normalised.yMin
    const yStep = yRange > 100 ? 25 : yRange > 40 ? 10 : 5
    const yTicks: number[] = []
    const yStart = Math.ceil(normalised.yMin / yStep) * yStep
    for (let v = yStart; v <= normalised.yMax; v += yStep) yTicks.push(v)

    const xCount = innerW > 500 ? 6 : innerW > 300 ? 4 : 3
    const step = Math.max(1, Math.floor(allDates.length / xCount))
    const xTicks = allDates.filter((_, i) => i % step === 0)

    return { innerW, innerH, xScale, yScale, tPath: toPath(normalised.ticker), bPath: toPath(normalised.bench), zeroY: yScale(0), yTicks, xTicks }
  }, [normalised, cw])

  const alpha = normalised ? normalised.finalTickerPct - normalised.finalBenchPct : 0
  const company = actions[0]?.company_name ?? ''
  const lastPrice = tickerPairs.length ? tickerPairs[tickerPairs.length - 1].price : null

  // Hover handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svg || !tickerPairs.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - M.left
    const date = svg.xScale.invert(x)
    const ms = date.getTime()
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < tickerPairs.length; i++) {
      const d = Math.abs(new Date(tickerPairs[i].date).getTime() - ms)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    setHoverIdx(bestIdx)
  }

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

            {/* Chart */}
            <Box ref={containerRef} sx={{ width: '100%', mb: 0.5, position: 'relative' }}>
              <svg
                width={cw}
                height={CHART_H}
                style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {/* Cone gradients + plot clip — matches the timeline chart's
                    visual language so the popup and the full chart speak the
                    same vocabulary (dot + radiating light cone, not arrows). */}
                <defs>
                  <linearGradient id="quick-buy-glow" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#16a34a" stopOpacity="0.85" />
                    <stop offset="0.35" stopColor="#16a34a" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="quick-sell-glow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#dc2626" stopOpacity="0.85" />
                    <stop offset="0.35" stopColor="#dc2626" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#dc2626" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="quick-plot-clip">
                    <rect x={0} y={0} width={svg.innerW} height={svg.innerH} />
                  </clipPath>
                </defs>
                <g transform={`translate(${M.left},${M.top})`}>
                  {/* Grid lines */}
                  {svg.yTicks.map((v) => (
                    <line key={v} x1={0} x2={svg.innerW} y1={svg.yScale(v)} y2={svg.yScale(v)}
                      stroke="#f1f5f9" strokeWidth={1} />
                  ))}

                  {/* Zero line */}
                  {svg.zeroY >= 0 && svg.zeroY <= svg.innerH && (
                    <line x1={0} x2={svg.innerW} y1={svg.zeroY} y2={svg.zeroY}
                      stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 2" />
                  )}

                  {/* Y axis labels */}
                  {svg.yTicks.map((v) => (
                    <text key={v} x={-8} y={svg.yScale(v) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
                      {fmtPct(v)}
                    </text>
                  ))}

                  {/* X axis labels */}
                  {svg.xTicks.map((d, i) => (
                    <text key={i} x={svg.xScale(d)} y={svg.innerH + 18}
                      textAnchor="middle" fontSize={10} fill="#94a3b8">
                      {fmtDateAxis(d)}
                    </text>
                  ))}

                  {/* Benchmark line */}
                  <path d={svg.bPath} stroke="#cbd5e1" strokeWidth={1.5}
                    strokeDasharray="6 3" fill="none" />

                  {/* Ticker line */}
                  <path d={svg.tPath} stroke="#1e40af" strokeWidth={2.5} fill="none" />

                  {/* Decision markers — dot on the line + cone glow radiating
                      up (buy) or down (sell). Same shape language as the
                      timeline chart. Cones go in a clipped, multiply-blended
                      group so overlapping cones darken/saturate. Dots render
                      separately on top. */}
                  <g clipPath="url(#quick-plot-clip)" style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }}>
                    {markers.map((m, i) => {
                      const cx = svg.xScale(new Date(m.date))
                      const cy = svg.yScale(m.pct)
                      const isBuy = m.category === 'buy'
                      const h = 28          // cone height in px
                      const hw = 14         // cone half-width
                      const baseY = isBuy ? cy - h : cy + h
                      const path = `M ${cx} ${cy} L ${cx + hw} ${baseY} L ${cx - hw} ${baseY} Z`
                      return (
                        <path
                          key={`cone-${i}`}
                          d={path}
                          fill={isBuy ? 'url(#quick-buy-glow)' : 'url(#quick-sell-glow)'}
                          opacity={0.85}
                        />
                      )
                    })}
                  </g>
                  {markers.map((m, i) => {
                    const cx = svg.xScale(new Date(m.date))
                    const cy = svg.yScale(m.pct)
                    return (
                      <circle
                        key={`dot-${i}`}
                        cx={cx} cy={cy} r={4}
                        fill={m.color}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    )
                  })}

                  {/* Crosshair on hover */}
                  {hoverIdx != null && normalised && (
                    (() => {
                      const pt = normalised.ticker[hoverIdx]
                      if (!pt) return null
                      const hx = svg.xScale(new Date(pt.date))
                      const hy = svg.yScale(pt.pct)
                      return (
                        <g>
                          <line x1={hx} x2={hx} y1={0} y2={svg.innerH}
                            stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" />
                          <circle cx={hx} cy={hy} r={4} fill="#1e40af" stroke="#fff" strokeWidth={2} />
                        </g>
                      )
                    })()
                  )}
                </g>
              </svg>

              {/* Hover tooltip */}
              {hoverIdx != null && tickerPairs[hoverIdx] && normalised && (
                <Box sx={{
                  position: 'absolute',
                  top: 4,
                  right: 8,
                  bgcolor: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  px: 1.5,
                  py: 0.5,
                  pointerEvents: 'none',
                }}>
                  <Typography variant="caption" color="text.secondary">
                    {fmtDateShort(new Date(tickerPairs[hoverIdx].date))}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {fmtPrice(tickerPairs[hoverIdx].price)}{' '}
                    <Typography component="span" variant="caption"
                      sx={{ color: normalised.ticker[hoverIdx].pct >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmtPct(normalised.ticker[hoverIdx].pct)}
                    </Typography>
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Legend */}
            <Box sx={{ display: 'flex', gap: 2, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 18, height: 3, bgcolor: '#1e40af', borderRadius: 1 }} />
                <Typography variant="caption" color="text.secondary">${ticker}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <svg width={18} height={8}><line x1={0} y1={4} x2={18} y2={4} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 2" /></svg>
                <Typography variant="caption" color="text.secondary">S&P 500</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <svg width={12} height={12}><circle cx={6} cy={6} r={4} fill="#16a34a" stroke="#fff" strokeWidth={1} /></svg>
                <Typography variant="caption" color="text.secondary">Buy</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <svg width={12} height={12}><circle cx={6} cy={6} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1} /></svg>
                <Typography variant="caption" color="text.secondary">Sell</Typography>
              </Box>
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
