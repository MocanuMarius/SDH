/**
 * Embedded timeline chart for a single ticker: price line + decision markers
 * + always-on benchmark overlay(s). Used on Idea detail page so the chart
 * shows immediately without going to /timeline.
 *
 * Rendering core is the shared `TimelineChartVisx` — same dot+cone markers,
 * axes, hover, and overlay rendering as the /timeline page and the ticker
 * popup. This file owns the surrounding controls (range tabs, compare chips,
 * range summary, drag-to-measure overlay) and stays out of the chart's
 * internals.
 */

import { useEffect, useState, useMemo, useRef } from 'react'
import { Box, Typography, Paper, CircularProgress, Alert, FormControl, Select, MenuItem, Tabs, Tab, Chip } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { ParentSize } from '@visx/responsive'
import { fetchChartData, type ChartRange } from '../services/chartApiService'
import type { ActionWithEntry } from '../services/actionsService'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import { getChartCategory } from '../theme/decisionTypes'
import { computeRangeStats, type RangeStats } from '../utils/chartRangeStats'
import TimelineChartVisx, { type TimelineChartPoint, getTimelineChartResponsiveMargin } from './TimelineChartVisx'

// Cap the number of points sent to the chart. SVG renders thousands fine,
// but downsampling speeds up clustering & marker layout for long ranges.
const MAX_CHART_POINTS = 280

const BENCHMARK_OPTIONS: { symbol: string; label: string }[] = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'VWCE.DE', label: 'All-World (VWCE)' },
]

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'MAX' },
]

const MAX_COMPARE_SYMBOLS = 3

export interface TickerTimelineChartProps {
  symbol: string
  actions: ActionWithEntry[]
  /** Company name for fallback lookup when symbol fails (e.g. "Evolution AB" → EVO.ST) */
  companyName?: string
  height?: number
  defaultRange?: ChartRange
}

/** Find the chart-data point closest to a given action_date. Used to snap
 *  decision markers onto the actual price-line points the chart renders. */
function getClosestPoint(
  chartData: { date: string; price: number }[],
  actionDate: string
): { date: string; price: number } {
  if (!chartData.length) return { date: actionDate, price: 0 }
  const exact = chartData.find((d) => d.date === actionDate)
  if (exact) return exact
  let best = chartData[0]
  let bestDiff = Math.abs(Date.parse(actionDate) - Date.parse(best.date))
  for (const p of chartData) {
    const d = Math.abs(Date.parse(actionDate) - Date.parse(p.date))
    if (d < bestDiff) { bestDiff = d; best = p }
  }
  return best
}

export default function TickerTimelineChart({ symbol, actions, companyName, height = 320, defaultRange = '1y' }: TickerTimelineChartProps) {
  const [range, setRange] = useState<ChartRange>(defaultRange)
  const [userChangedRange, setUserChangedRange] = useState(false)
  const [chartData, setChartData] = useState<{ date: string; price: number }[]>([])

  // Sync with defaultRange when it changes (e.g. from auto-range compute), unless user manually picked one.
  useEffect(() => {
    if (!userChangedRange) setRange(defaultRange)
  }, [defaultRange, userChangedRange])

  const [compareSymbols, setCompareSymbols] = useState<string[]>(['SPY'])
  const [compareDataList, setCompareDataList] = useState<Array<{ symbol: string; dates: string[]; prices: number[] }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [measureSelection, setMeasureSelection] = useState<{ startIndex: number; endIndex: number } | null>(null)
  const [wrapperWidth, setWrapperWidth] = useState(0)
  const [wrapperHeight, setWrapperHeight] = useState(0)
  const chartWrapperRef = useRef<HTMLDivElement>(null)
  const selectEndXRef = useRef(0)
  const rafSelectRef = useRef<number | null>(null)
  const justFinishedDragRef = useRef(false)
  const companyKey = normalizeTickerToCompany(symbol)
  const displaySymbol = companyKey || (symbol?.toUpperCase() ?? '')

  // Use the same responsive margins as TimelineChartVisx so the drag-to-
  // measure overlay aligns pixel-perfect with the chart's plot area.
  const chartMargin = useMemo(() => getTimelineChartResponsiveMargin(wrapperWidth || 600), [wrapperWidth])
  const plotLeft = chartMargin.left
  const plotRight = chartMargin.right
  // Stable string key — primitive dep for the fetch useEffect below.
  const compareSymbolsKey = compareSymbols.join(',')

  useEffect(() => {
    if (!symbol?.trim()) {
      setChartData([])
      setCompareDataList([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const sym = symbol.trim().toUpperCase()
    Promise.all([
      fetchChartData(sym, range),
      ...compareSymbols.map((s) => fetchChartData(s.trim().toUpperCase(), range).catch(() => null)),
    ])
      .then((results) => {
        if (cancelled) return
        const [data, ...benchResults] = results
        if (data?.dates?.length) {
          const main = (data as { dates: string[]; prices: number[] }).dates
            .map((d, i) => ({ date: d, price: (data as { prices: number[] }).prices[i] ?? 0 }))
            .filter((p) => p.price > 0)
          setChartData(main)
          const list = compareSymbols
            .map((s, i) => {
              const b = benchResults[i] as { dates?: string[]; prices?: number[] } | null
              return b?.dates?.length ? { symbol: s.trim().toUpperCase(), dates: b.dates, prices: b.prices ?? [] } : null
            })
            .filter((x): x is { symbol: string; dates: string[]; prices: number[] } => x != null)
          setCompareDataList(list)
        } else {
          setChartData([])
          setCompareDataList([])
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Chart failed. Run: node scripts/serve-chart-api.js')
        setChartData([])
        setCompareDataList([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // compareSymbolsKey: stable string dep so the fetch only re-runs when
    // the actual selected compares change, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range, companyName, compareSymbolsKey])

  // Filter actions to the currently-fetched range and the right ticker.
  const minDate = chartData[0]?.date ?? ''
  const maxDate = chartData.length > 0 ? new Date().toISOString().slice(0, 10) : ''
  const actionsInRange = useMemo(
    () =>
      companyKey
        ? actions.filter(
            (a) =>
              normalizeTickerToCompany(a.ticker) === companyKey &&
              (a.action_date ?? '') >= minDate &&
              (a.action_date ?? '') <= maxDate
          )
        : [],
    [actions, companyKey, minDate, maxDate]
  )

  // Cap chart data to MAX_CHART_POINTS by even-step sampling. Speeds up
  // marker clustering on long ranges; SVG handles the raw count fine.
  const downsampledChartData = useMemo(() => {
    if (chartData.length <= MAX_CHART_POINTS) return chartData
    const step = (chartData.length - 1) / (MAX_CHART_POINTS - 1)
    const out: typeof chartData = []
    for (let i = 0; i < MAX_CHART_POINTS; i++) {
      const idx = i === MAX_CHART_POINTS - 1 ? chartData.length - 1 : Math.round(i * step)
      out.push(chartData[idx])
    }
    return out
  }, [chartData])

  // Bucket decisions by their nearest chart-data date, then attach to that
  // point. TimelineChartVisx clusters & renders markers from the
  // `decisions` field; we don't need to cluster here.
  const chartPoints: TimelineChartPoint[] = useMemo(() => {
    const byDate = new Map<string, Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>>()
    for (const a of actionsInRange) {
      const closest = getClosestPoint(downsampledChartData, a.action_date ?? '')
      const key = closest.date
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push({ action: a, type: getChartCategory(a.type) })
    }
    return downsampledChartData.map((d) => ({
      date: d.date,
      price: d.price,
      decisions: byDate.get(d.date),
    }))
  }, [downsampledChartData, actionsInRange])

  // Y-axis domain — raw prices with 5% headroom each side. The chart
  // expands further as needed to fit benchmark overlays mapped onto this
  // scale.
  const yDomain: [number, number] | null = useMemo(() => {
    if (chartData.length === 0) return null
    const prices = chartData.map((d) => d.price)
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const span = hi - lo || 1
    return [lo - span * 0.05, hi + span * 0.05]
  }, [chartData])

  // Range summary: current price, total %change, CAGR (skips sub-month
  // windows where it's noisy), date range, min/max.
  const rangeSummary = useMemo(() => {
    if (!chartData.length) return null
    const first = chartData[0]
    const last = chartData[chartData.length - 1]
    if (!first?.price || !last?.price) return null
    const pctChange = ((last.price - first.price) / first.price) * 100
    const min = Math.min(...chartData.map((d) => d.price))
    const max = Math.max(...chartData.map((d) => d.price))
    const startMs = new Date(first.date).getTime()
    const endMs = new Date(last.date).getTime()
    const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000)
    const cagr =
      years >= 0.08 && first.price > 0
        ? (Math.pow(last.price / first.price, 1 / years) - 1) * 100
        : null
    return {
      firstPrice: first.price,
      lastPrice: last.price,
      pctChange,
      cagr,
      min,
      max,
      startDate: first.date,
      endDate: last.date,
    }
  }, [chartData])

  // Pre-computed (date, price) array used by the measure-drag stats popup.
  // Always raw prices — TimelineChartVisx's display scale is also raw.
  const dataForStats = useMemo(
    () => chartPoints.map((d) => ({ date: d.date, price: d.price })),
    [chartPoints]
  )

  // Stats for the committed measure-selection (after mouse-up).
  const rangeStats = useMemo((): RangeStats | null => {
    if (!measureSelection || dataForStats.length === 0) return null
    return computeRangeStats(dataForStats, measureSelection.startIndex, measureSelection.endIndex)
  }, [measureSelection, dataForStats])

  const [selecting, setSelecting] = useState<{ startX: number; endX: number } | null>(null)
  const [crosshairX, setCrosshairX] = useState<number | null>(null)

  // Stats for the live drag (before mouse-up). Used to render a floating
  // pill that follows the drag rectangle.
  const liveSelectionStats = useMemo((): RangeStats | null => {
    if (!selecting || wrapperWidth <= 0 || dataForStats.length === 0) return null
    const plotWidth = wrapperWidth - plotLeft - plotRight
    if (plotWidth <= 0) return null
    const dataLen = dataForStats.length
    const [x1, x2] = selecting.startX < selecting.endX ? [selecting.startX, selecting.endX] : [selecting.endX, selecting.startX]
    const plotX1 = Math.max(0, x1 - plotLeft)
    const plotX2 = Math.min(plotWidth, x2 - plotLeft)
    const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
    let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
    if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, dataLen - 1)
    return computeRangeStats(dataForStats, startIndex, endIndex)
  }, [selecting, wrapperWidth, dataForStats, plotLeft, plotRight])

  useEffect(() => {
    const el = chartWrapperRef.current
    if (!el) return
    const update = () => {
      const { width: w, height: h } = el.getBoundingClientRect()
      setWrapperWidth(w > 0 ? w : 0)
      setWrapperHeight(h > 0 ? h : 0)
    }
    const t = requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(t)
      ro.disconnect()
    }
  }, [loading, chartPoints.length])

  // ---------------- measure-drag handlers ----------------
  // Mouse-down on a non-marker → start selecting. We skip when the click
  // landed on a decision marker so the marker can handle its own click.
  const handleMeasureMouseDown = (e: React.MouseEvent) => {
    const target = e.target as Element | null
    if (target?.closest?.('circle') || (target as SVGElement)?.tagName === 'circle') return
    if (target?.closest?.('.timeline-decision-marker')) return
    const el = chartWrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCrosshairX(null)
    setSelecting({ startX: e.clientX - rect.left, endX: e.clientX - rect.left })
  }
  const handleMeasureMouseMove = (e: React.MouseEvent) => {
    const el = chartWrapperRef.current
    if (!el) return
    const x = e.clientX - el.getBoundingClientRect().left
    if (selecting) {
      // Throttle setState to one update per frame for smooth dragging.
      selectEndXRef.current = x
      if (rafSelectRef.current == null) {
        rafSelectRef.current = requestAnimationFrame(() => {
          rafSelectRef.current = null
          setSelecting((prev) => (prev ? { ...prev, endX: selectEndXRef.current } : null))
        })
      }
    } else {
      setCrosshairX(x)
    }
  }
  const commitSelection = (sel: { startX: number; endX: number }) => {
    if (!chartWrapperRef.current) return
    if (Math.abs(sel.endX - sel.startX) < 20) return  // accidental drag
    const rect = chartWrapperRef.current.getBoundingClientRect()
    const plotWidth = rect.width - plotLeft - plotRight
    if (plotWidth <= 0) return
    const dataLen = chartPoints.length
    const [x1, x2] = sel.startX < sel.endX ? [sel.startX, sel.endX] : [sel.endX, sel.startX]
    const plotX1 = Math.max(0, x1 - plotLeft)
    const plotX2 = Math.min(plotWidth, x2 - plotLeft)
    const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
    let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
    if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, dataLen - 1)
    setMeasureSelection({ startIndex, endIndex })
    justFinishedDragRef.current = true
  }
  const handleMeasureMouseUp = () => {
    if (!selecting) return
    commitSelection(selecting)
    setSelecting(null)
  }
  const handleMeasureMouseLeave = () => {
    setCrosshairX(null)
    if (selecting) setSelecting(null)
    if (rafSelectRef.current != null) {
      cancelAnimationFrame(rafSelectRef.current)
      rafSelectRef.current = null
    }
  }

  const getXFromClient = (clientX: number): number => {
    const el = chartWrapperRef.current
    if (!el) return 0
    return clientX - el.getBoundingClientRect().left
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as Element | null
    if (target?.closest?.('circle') || (target as SVGElement)?.tagName === 'circle') return
    if (target?.closest?.('.timeline-decision-marker')) return
    if (e.touches.length === 0) return
    const x = getXFromClient(e.touches[0].clientX)
    setSelecting({ startX: x, endX: x })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!selecting || e.touches.length === 0) return
    e.preventDefault()
    selectEndXRef.current = getXFromClient(e.touches[0].clientX)
    if (rafSelectRef.current == null) {
      rafSelectRef.current = requestAnimationFrame(() => {
        rafSelectRef.current = null
        setSelecting((prev) => (prev ? { ...prev, endX: selectEndXRef.current } : null))
      })
    }
  }

  const handleTouchEnd = () => {
    if (!selecting) return
    commitSelection(selecting)
    setSelecting(null)
  }

  // Benchmark data for the chart — pass all chosen compares as an array.
  // TimelineChartVisx maps each onto the ticker's price scale (anchored to
  // the first visible date) and renders distinct dashed grey lines.
  const benchmarkDataForChart = useMemo(
    () => compareDataList.map((b) => ({ ticker: b.symbol, dates: b.dates, prices: b.prices })),
    [compareDataList]
  )

  if (!symbol?.trim()) return null

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={height}>
          <CircularProgress />
        </Box>
      </Paper>
    )
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        {error}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Chart data may be unavailable for this symbol. Decisions table below is still available.
        </Typography>
      </Alert>
    )
  }

  if (chartData.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">
          No chart data for {getTickerDisplayLabel(symbol) || displaySymbol}. Symbol may be invalid or delisted.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, mb: 2, minWidth: 0, overflow: 'hidden' }}>
      {/* Header row — title + compare control */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Price &amp; decisions
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', ml: 'auto' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Compare</Typography>
          {compareSymbols.map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              onDelete={() => setCompareSymbols((prev) => prev.filter((x) => x !== s))}
              deleteIcon={<DeleteOutlineIcon fontSize="small" />}
            />
          ))}
          {compareSymbols.length < MAX_COMPARE_SYMBOLS && (
            <FormControl size="small" sx={{ minWidth: 90 }} variant="outlined">
              <Select
                value=""
                displayEmpty
                renderValue={() => '+ Add'}
                onChange={(e) => {
                  const v = e.target.value as string
                  if (v && !compareSymbols.includes(v)) setCompareSymbols((prev) => [...prev, v].slice(0, MAX_COMPARE_SYMBOLS))
                }}
              >
                {BENCHMARK_OPTIONS.filter((b) => !compareSymbols.includes(b.symbol)).map((b) => (
                  <MenuItem key={b.symbol} value={b.symbol}>{b.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Box>

      {/* Range selector — its own row so all buttons fit without scroll arrows on narrow viewports. */}
      <Box sx={{ mb: 1, mx: -0.25 }}>
        <Tabs
          value={range}
          onChange={(_e, v) => { setRange(v as ChartRange); setUserChangedRange(true) }}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            minHeight: 32,
            '& .MuiTabs-flexContainer': { gap: 0.25, justifyContent: 'flex-start', flexWrap: 'wrap' },
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTab-root': {
              minHeight: 28,
              minWidth: 36,
              py: 0.25,
              px: 1,
              fontSize: '0.78rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
              color: 'text.secondary',
              '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' },
              '&:hover': { bgcolor: 'action.hover' },
              '&.Mui-selected:hover': { bgcolor: 'primary.dark' },
            },
          }}
        >
          {RANGES.map((r) => (
            <Tab key={r.value} value={r.value} label={r.label} />
          ))}
        </Tabs>
      </Box>

      {/* Range summary line — current price, %change, CAGR, date range. */}
      {rangeSummary && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight={700} component="span">
            ${rangeSummary.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
          <Typography
            variant="body2"
            component="span"
            sx={{ color: rangeSummary.pctChange >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
          >
            {rangeSummary.pctChange >= 0 ? '+' : ''}{rangeSummary.pctChange.toFixed(2)}%
          </Typography>
          {rangeSummary.cagr != null && (
            <Typography
              variant="body2"
              component="span"
              sx={{ color: 'text.secondary', fontWeight: 500 }}
            >
              {rangeSummary.cagr >= 0 ? '+' : ''}{rangeSummary.cagr.toFixed(1)}%/yr
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" component="span">
            {rangeSummary.startDate} – {rangeSummary.endDate}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="span">
            Range ${rangeSummary.min.toFixed(2)} – ${rangeSummary.max.toFixed(2)}
          </Typography>
        </Box>
      )}

      {/* Chart area — TimelineChartVisx renders the line, axes, decision
          markers, hover tooltip, and benchmark overlays. This wrapper Box
          owns the drag-to-measure overlay (dim band + stats pill) and
          crosshair. The drag handlers compute against `plotLeft`/`plotRight`
          (which match TimelineChartVisx's responsive margins) so the
          overlay aligns pixel-perfect with the chart's plot area. */}
      <Box
        ref={chartWrapperRef}
        tabIndex={0}
        role="application"
        aria-label="Price chart; drag to select range for % change"
        sx={{
          height,
          width: '100%',
          minWidth: 0,
          minHeight: 120,
          position: 'relative',
          cursor: 'crosshair',
          userSelect: selecting ? 'none' : 'auto',
          outline: 'none',
          '&:focus': { outline: 'none' },
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setMeasureSelection(null)
            setSelecting(null)
          }
        }}
        onMouseDown={handleMeasureMouseDown}
        onMouseMove={handleMeasureMouseMove}
        onMouseUp={handleMeasureMouseUp}
        onMouseLeave={handleMeasureMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => setSelecting(null)}
        onDoubleClick={() => setMeasureSelection(null)}
      >
        <Box sx={{ width: '100%', height: '100%', minWidth: 0, pointerEvents: selecting ? 'none' : 'auto', outline: 'none' }}>
          {wrapperWidth > 0 && wrapperHeight > 0 && yDomain && chartPoints.length > 0 && (
            <ParentSize>
              {({ width: pw, height: ph }) => (pw > 10 && ph > 10) ? (
                <TimelineChartVisx
                  data={chartPoints}
                  symbol={displaySymbol}
                  yDomain={yDomain}
                  width={pw}
                  height={ph}
                  selectedActionId={null}
                  selectedTicker={null}
                  onSelectAction={() => { /* no external selection list */ }}
                  onChartClick={() => {
                    // Background click clears any committed measure-selection,
                    // but only if we didn't just finish a drag (which would
                    // also fire a click as a side effect of mouseup).
                    if (justFinishedDragRef.current) {
                      justFinishedDragRef.current = false
                      return
                    }
                    setMeasureSelection(null)
                  }}
                  onMouseLeave={() => { /* no list to clear */ }}
                  showBrush={false}
                  benchmarkData={benchmarkDataForChart.length ? benchmarkDataForChart : null}
                  disableMarkerClick
                />
              ) : null}
            </ParentSize>
          )}
        </Box>

        {/* Crosshair (no drag in progress) */}
        {crosshairX != null && !selecting && (
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9 }}>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: crosshairX,
                width: 1,
                bgcolor: 'rgba(0,0,0,0.2)',
              }}
            />
          </Box>
        )}

        {/* Drag overlay (during selection) */}
        {selecting && (
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: Math.min(selecting.startX, selecting.endX),
                width: Math.abs(selecting.endX - selecting.startX),
                bgcolor: 'rgba(59, 130, 246, 0.1)',
              }}
            />
          </Box>
        )}

        {/* Range stats pill — floats over the chart while dragging or
            after a committed selection. */}
        {(() => {
          const stats = selecting ? liveSelectionStats : rangeStats
          const showTooltip = (selecting && liveSelectionStats) || (measureSelection && rangeStats && wrapperWidth > 0)
          if (!showTooltip || !stats) return null
          let tooltipLeft = selecting
            ? (selecting.startX + selecting.endX) / 2
            : plotLeft + ((measureSelection!.startIndex + measureSelection!.endIndex) / 2 / Math.max(1, chartPoints.length)) * (wrapperWidth - plotLeft - plotRight)
          const tooltipHalfWidth = 84
          if (wrapperWidth > 0) {
            tooltipLeft = Math.max(tooltipHalfWidth, Math.min(wrapperWidth - tooltipHalfWidth, tooltipLeft))
          }
          return (
            <Box
              sx={{
                position: 'absolute',
                top: 10,
                left: tooltipLeft,
                transform: 'translateX(-50%)',
                zIndex: 11,
                pointerEvents: 'none',
              }}
            >
              <Paper
                elevation={3}
                sx={{
                  p: 1.25,
                  minWidth: 168,
                  borderRadius: 1.5,
                  boxShadow: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                <Typography variant="caption" color="text.secondary" display="block">
                  {new Date(stats.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} – {new Date(stats.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ color: stats.pctChange >= 0 ? 'success.main' : 'error.main', fontSize: '1rem' }}>
                  {stats.pctChange >= 0 ? '+' : ''}{stats.pctChange.toFixed(2)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Price: {stats.endPrice >= stats.startPrice ? '+' : ''}{(stats.endPrice - stats.startPrice).toFixed(2)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Drawdown: -{stats.drawdownPct.toFixed(1)}%
                </Typography>
              </Paper>
            </Box>
          )
        })()}
      </Box>
    </Paper>
  )
}
