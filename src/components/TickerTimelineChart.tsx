/**
 * Embedded timeline chart for a single ticker: price line + decision markers.
 * Used on Idea detail page so the chart shows immediately without going to /timeline.
 */

import { useEffect, useState, useMemo, useRef, memo } from 'react'
import { Box, Typography, Paper, CircularProgress, Alert, FormControl, Select, MenuItem, Tabs, Tab, Chip } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from 'recharts'
import { fetchChartData, type ChartRange } from '../services/chartApiService'
import type { ActionWithEntry } from '../services/actionsService'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import { DECISION_CHART_COLORS, getChartCategory } from '../theme/decisionTypes'
import { computeRangeStats, type RangeStats } from '../utils/chartRangeStats'

const MAX_CHART_POINTS = 280
const CHART_LINE_COLOR = '#334155'
const CHART_LINE_WIDTH = 2
const FONT_SIZE_AXIS = 13
const FONT_SIZE_TOOLTIP = 12
const DECISION_COLORS = DECISION_CHART_COLORS
const CLUSTER_GAP = 20
const SINGLE_DOT_R = 5
const SINGLE_DOT_R_PASS = 6
const GRID_OPACITY = 0.12

const BENCHMARK_LINE_COLOR = '#94a3b8'
const BENCHMARK_LINE_WIDTH = 1.5

const BENCHMARK_OPTIONS: { symbol: string; label: string }[] = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'VWCE.DE', label: 'All-World (VWCE)' },
]

interface ChartPointWithDecisions {
  date: string
  price: number
  /** Normalized to 100 at start (when benchmark overlay is used) */
  priceNorm?: number
  /** Benchmark normalized to 100 at same start date */
  benchmarkNorm?: number
  decisions?: Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>
}

interface ChartPointEnriched extends ChartPointWithDecisions {
  _clusterRep?: boolean
  _clusterCounts?: { buy: number; sell: number; other: number }
  _clusterDecisions?: ChartPointWithDecisions['decisions']
}

function getClosestPoint(
  chartData: { date: string; price: number }[],
  actionDate: string
): { date: string; price: number } {
  if (!chartData.length) return { date: actionDate, price: 0 }
  const exact = chartData.find((d) => d.date === actionDate)
  if (exact) return exact
  const sorted = [...chartData].sort((a, b) => a.date.localeCompare(b.date))
  let best = sorted[0]
  let bestDiff = Math.abs(Date.parse(actionDate) - Date.parse(best.date))
  for (const p of sorted) {
    const d = Math.abs(Date.parse(actionDate) - Date.parse(p.date))
    if (d < bestDiff) {
      bestDiff = d
      best = p
    }
  }
  return best
}

function getDecisionCountsByType(decisions: ChartPointWithDecisions['decisions']) {
  const counts = { buy: 0, sell: 0, other: 0 }
  if (!decisions?.length) return counts
  for (const d of decisions) {
    if (d.type === 'buy') counts.buy++
    else if (d.type === 'sell') counts.sell++
    else counts.other++
  }
  return counts
}

function computeClusters(data: ChartPointWithDecisions[]): Array<{ startIdx: number; endIdx: number; repIdx: number; counts: { buy: number; sell: number; other: number }; decisions: ChartPointWithDecisions['decisions'] }> {
  const indicesWithDecisions: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (data[i].decisions?.length) indicesWithDecisions.push(i)
  }
  if (indicesWithDecisions.length === 0) return []
  const clusters: Array<{ startIdx: number; endIdx: number; repIdx: number; counts: { buy: number; sell: number; other: number }; decisions: ChartPointWithDecisions['decisions'] }> = []
  let start = indicesWithDecisions[0]
  let end = start
  let allDecisions = [...(data[start].decisions ?? [])]
  for (let k = 1; k < indicesWithDecisions.length; k++) {
    const i = indicesWithDecisions[k]
    if (i - end <= CLUSTER_GAP) {
      end = i
      allDecisions = allDecisions.concat(data[i].decisions ?? [])
    } else {
      const counts = getDecisionCountsByType(allDecisions)
      const repIdx = Math.floor((start + end) / 2)
      clusters.push({ startIdx: start, endIdx: end, repIdx, counts, decisions: allDecisions })
      start = i
      end = i
      allDecisions = [...(data[i].decisions ?? [])]
    }
  }
  const counts = getDecisionCountsByType(allDecisions)
  const repIdx = Math.floor((start + end) / 2)
  clusters.push({ startIdx: start, endIdx: end, repIdx, counts, decisions: allDecisions })
  return clusters
}

function enrichChartDataWithClusters(data: ChartPointWithDecisions[]): ChartPointEnriched[] {
  const clusters = computeClusters(data)
  const clusterByRep = new Map(clusters.map((c) => [c.repIdx, c]))
  return data.map((pt, i) => {
    const base = { ...pt } as ChartPointEnriched
    if (!pt.decisions?.length) return base
    const cluster = clusters.find((c) => i >= c.startIdx && i <= c.endIdx)
    if (!cluster) return base
    if (cluster.repIdx !== i) {
      base._clusterRep = false
      return base
    }
    const c = clusterByRep.get(i)
    if (c) {
      base._clusterRep = true
      base._clusterCounts = c.counts
      base._clusterDecisions = c.decisions
    }
    return base
  })
}

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

function TooltipContent({
  active,
  payload,
  label,
  symbol,
  benchmarkSymbol: benchmarkTicker,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ name?: string; value?: number; payload?: unknown }>
  label?: string | number
  symbol: string
  benchmarkSymbol?: string
}) {
  if (!active || !payload?.length) return null
  const pricePayload = payload.find((p) => p.name === symbol || (p as { dataKey?: string }).dataKey === 'price' || (p as { dataKey?: string }).dataKey === 'priceNorm')
  const pointPayload = pricePayload?.payload as ChartPointEnriched | undefined
  const pointDecisions = pointPayload?._clusterDecisions ?? pointPayload?.decisions
  if (pointDecisions?.length) {
    const first = pointDecisions[0].action
    const counts = getDecisionCountsByType(pointDecisions)
    const parts: string[] = []
    if (counts.buy) parts.push(`${counts.buy} buy`)
    if (counts.sell) parts.push(`${counts.sell} sell`)
    if (counts.other) parts.push(`${counts.other} other`)
    return (
      <Paper variant="outlined" sx={{ p: 1.5, maxWidth: 280 }}>
        <Typography variant="body2" fontWeight={600} display="block">
          {first.type} · {getTickerDisplayLabel(first.ticker) || `$${first.ticker ?? '?'}`}
          {pointDecisions.length > 1 ? ` (+${pointDecisions.length - 1} more)` : ''}
        </Typography>
        {parts.length > 1 && (
          <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {parts.join(' · ')}
          </Typography>
        )}
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          {pointPayload?.date}
          {first.price ? ` · $${first.price}` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          ${symbol} {typeof (pointPayload as { priceNorm?: number })?.priceNorm === 'number' ? (pointPayload as { priceNorm: number }).priceNorm.toFixed(2) : typeof pointPayload?.price === 'number' ? pointPayload.price.toFixed(2) : '—'}
        </Typography>
      </Paper>
    )
  }
  const raw = pricePayload?.value ?? (pointPayload as { price?: number; priceNorm?: number } | undefined)?.price ?? (pointPayload as { priceNorm?: number })?.priceNorm
  const value = typeof raw === 'number' ? raw : undefined
  const pt = pointPayload as { benchmarkNorm?: number } | undefined
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label != null ? new Date(String(label)).toLocaleDateString('en-US', { dateStyle: 'medium' }) : ''}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: '0.8rem' }}>
        ${symbol} {value != null ? value.toFixed(2) : '—'}
      </Typography>
      {pt?.benchmarkNorm != null && Number.isFinite(pt.benchmarkNorm) && (
        <Typography variant="caption" sx={{ fontSize: '0.8rem', color: 'text.secondary', display: 'block' }}>
          {benchmarkTicker ? `$${benchmarkTicker}` : 'Benchmark'} {pt.benchmarkNorm.toFixed(2)}
        </Typography>
      )}
    </Paper>
  )
}

export interface TickerTimelineChartProps {
  symbol: string
  actions: ActionWithEntry[]
  /** Company name for fallback lookup when symbol fails (e.g. "Evolution AB" → EVO.ST) */
  companyName?: string
  height?: number
  defaultRange?: ChartRange
}

function mergeWithBenchmark(
  main: { date: string; price: number }[],
  benchmark: { dates: string[]; prices: number[] } | null
): { date: string; price: number; priceNorm: number; benchmarkNorm: number }[] {
  if (!main.length) return []
  if (!benchmark?.dates?.length) {
    return main.map((d) => ({ ...d, priceNorm: d.price, benchmarkNorm: 0 }))
  }
  const benchByDate = new Map<string, number>()
  benchmark.dates.forEach((d, i) => benchByDate.set(d, benchmark.prices[i] ?? 0))
  const sortedBenchDates = [...benchmark.dates].sort()
  const getBenchPrice = (date: string): number => {
    if (benchByDate.has(date)) return benchByDate.get(date)!
    const idx = sortedBenchDates.findIndex((d) => d >= date)
    if (idx <= 0) return sortedBenchDates.length ? (benchByDate.get(sortedBenchDates[0]) ?? 0) : 0
    return benchByDate.get(sortedBenchDates[idx - 1]) ?? 0
  }
  const refPrice = main[0].price
  const refBench = getBenchPrice(main[0].date)
  if (!refPrice || !refBench) return main.map((d) => ({ ...d, priceNorm: d.price, benchmarkNorm: 0 }))
  return main.map((d) => ({
    ...d,
    priceNorm: (d.price / refPrice) * 100,
    benchmarkNorm: (getBenchPrice(d.date) / refBench) * 100,
  }))
}

/** Merge main series with multiple compare series; each compare normalized to 100 at range start. */
function mergeWithBenchmarks(
  main: { date: string; price: number }[],
  benchmarks: Array<{ symbol: string; dates: string[]; prices: number[] }>
): { date: string; price: number; priceNorm: number; benchmarkNorm: number; [key: `compare_${string}`]: number }[] {
  if (!main.length) return []
  const refPrice = main[0].price
  if (!refPrice) return main.map((d) => ({ ...d, priceNorm: d.price, benchmarkNorm: 0 }))
  const getBenchPrice = (dates: string[], prices: number[], date: string): number => {
    const byDate = new Map<string, number>()
    dates.forEach((d, i) => byDate.set(d, prices[i] ?? 0))
    const sorted = [...dates].sort()
    if (byDate.has(date)) return byDate.get(date)!
    const idx = sorted.findIndex((d) => d >= date)
    if (idx <= 0) return sorted.length ? (byDate.get(sorted[0]) ?? 0) : 0
    return byDate.get(sorted[idx - 1]) ?? 0
  }
  return main.map((d) => {
    const out: { date: string; price: number; priceNorm: number; benchmarkNorm: number; [key: `compare_${string}`]: number } = {
      ...d,
      priceNorm: (d.price / refPrice) * 100,
      benchmarkNorm: 0,
    }
    benchmarks.forEach((b) => {
      if (!b.dates?.length) return
      const refB = getBenchPrice(b.dates, b.prices, main[0].date)
      if (!refB) return
      const key = `compare_${b.symbol}` as `compare_${string}`
      out[key] = (getBenchPrice(b.dates, b.prices, d.date) / refB) * 100
    })
    return out
  })
}

const MAX_COMPARE_SYMBOLS = 3

/** Custom X-axis tick component with rotation for better readability */
function CustomXAxisTick(props: { x?: number; y?: number; payload?: { value?: string }; rotation?: number; fontSize?: number }) {
  const { x = 0, y = 0, payload, rotation = -45, fontSize = FONT_SIZE_AXIS } = props
  if (!payload?.value) return null
  const formatted = new Date(payload.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="#334155"
        fontSize={fontSize}
        style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '0 0', whiteSpace: 'nowrap' }}
      >
        {formatted}
      </text>
    </g>
  )
}

/** Memoized dot component for chart points to avoid re-rendering on every update */
const CONE_HEIGHT = 28
const CONE_HALFW = 14

const ChartDot = memo(function ChartDot(props: {
  cx?: number
  cy?: number
  payload?: ChartPointEnriched
}) {
  const { cx, cy, payload: pt } = props
  if (cx == null || cy == null) return <g />
  if (pt?._clusterRep === false) return <g />
  const clusterDecisions = pt?._clusterDecisions
  const clusterCounts = pt?._clusterCounts
  const isCluster = pt?._clusterRep === true && clusterCounts && clusterDecisions?.length
  const decisions = isCluster ? clusterDecisions! : pt?.decisions
  if (!decisions?.length) return <g />
  const counts = isCluster ? clusterCounts! : getDecisionCountsByType(decisions)
  const first = decisions[0]
  const totalCount = counts.buy + counts.sell + counts.other
  const hasBuy = counts.buy > 0
  const hasSell = counts.sell > 0
  const isMixed = hasBuy && hasSell
  // Match the timeline chart's visual language: dot on the line + cone glow
  // radiating up (buys) or down (sells). Mixed marker → split dot (green top
  // + red bottom). "Other" types (pass / research) show a single neutral dot
  // with no cone since there's no directional thesis.
  const dotFill = isMixed
    ? DECISION_COLORS.buy   // outer ring colour; we paint the bottom red below
    : hasBuy ? DECISION_COLORS.buy
    : hasSell ? DECISION_COLORS.sell
    : DECISION_COLORS.other
  const r = first.action?.type === 'pass' ? SINGLE_DOT_R_PASS : SINGLE_DOT_R
  const buyConePath = `M ${cx} ${cy} L ${cx + CONE_HALFW} ${cy - CONE_HEIGHT} L ${cx - CONE_HALFW} ${cy - CONE_HEIGHT} Z`
  const sellConePath = `M ${cx} ${cy} L ${cx + CONE_HALFW} ${cy + CONE_HEIGHT} L ${cx - CONE_HALFW} ${cy + CONE_HEIGHT} Z`
  return (
    <g className="timeline-decision-marker" style={{ cursor: 'pointer' }}>
      {/* Cones — drawn first so dot stacks on top. Multiply blend so
          overlapping cones from clusters darken/saturate. */}
      {(hasBuy || hasSell) && (
        <g style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }}>
          {hasBuy && (
            <path d={buyConePath} fill="url(#ticker-buy-glow)" opacity={Math.min(0.95, 0.55 + (counts.buy - 1) * 0.12)} />
          )}
          {hasSell && (
            <path d={sellConePath} fill="url(#ticker-sell-glow)" opacity={Math.min(0.95, 0.55 + (counts.sell - 1) * 0.12)} />
          )}
        </g>
      )}
      {/* Dot. Mixed = split (green top semicircle, red bottom semicircle). */}
      {isMixed ? (
        <g>
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={DECISION_COLORS.buy} />
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`} fill={DECISION_COLORS.sell} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth={1} />
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={r} fill={dotFill} stroke="#fff" strokeWidth={1} />
      )}
      {totalCount > 1 && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={9}
          fontWeight={600}
          pointerEvents="none"
        >
          {totalCount}
        </text>
      )}
    </g>
  )
})

export default function TickerTimelineChart({ symbol, actions, companyName, height = 320, defaultRange = '1y' }: TickerTimelineChartProps) {
  const [range, setRange] = useState<ChartRange>(defaultRange)
  const [userChangedRange, setUserChangedRange] = useState(false)
  const [chartData, setChartData] = useState<{ date: string; price: number }[]>([])

  // Sync with defaultRange when it changes (e.g. from auto-range compute), unless user manually picked one
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
  // Responsive chart chrome — shrink margins, axis fonts, and x-axis band on
  // narrow viewports so the plot area gets to keep most of the width.
  const chartIsNarrow = wrapperWidth > 0 && wrapperWidth < 480
  const plotLeft = chartIsNarrow ? 36 : 48
  const plotRight = chartIsNarrow ? 12 : 20
  const plotTop = 12
  // Tight bottom margin — Recharts reserves this for x-axis + legend; kept
  // just big enough to hold tilted date labels + the small symbol legend.
  const plotBottom = chartIsNarrow ? 40 : 48
  const axisFontSize = chartIsNarrow ? 10 : 11
  const xAxisHeight = chartIsNarrow ? 44 : 56
  const xAxisRotation = chartIsNarrow ? -60 : -45

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
  }, [symbol, range, companyName, compareSymbols.join(',')])

  const chartDataWithBenchmark = useMemo(() => {
    if (compareDataList.length === 0) {
      return chartData.map((d) => ({ ...d, priceNorm: d.price, benchmarkNorm: 0 }))
    }
    if (compareDataList.length === 1) {
      return mergeWithBenchmark(chartData, { dates: compareDataList[0].dates, prices: compareDataList[0].prices })
    }
    return mergeWithBenchmarks(
      chartData,
      compareDataList.map((b) => ({ symbol: b.symbol, dates: b.dates, prices: b.prices }))
    )
  }, [chartData, compareDataList])

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

  const downsampledChartData = useMemo(() => {
    if (chartDataWithBenchmark.length <= MAX_CHART_POINTS) return chartDataWithBenchmark
    const step = (chartDataWithBenchmark.length - 1) / (MAX_CHART_POINTS - 1)
    const out: typeof chartDataWithBenchmark = []
    for (let i = 0; i < MAX_CHART_POINTS; i++) {
      const idx = i === MAX_CHART_POINTS - 1 ? chartDataWithBenchmark.length - 1 : Math.round(i * step)
      out.push(chartDataWithBenchmark[idx])
    }
    return out
  }, [chartDataWithBenchmark])

  const mergedChartData = useMemo((): ChartPointWithDecisions[] => {
    const byDate = new Map<string, Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>>()
    for (const a of actionsInRange) {
      const closest = getClosestPoint(downsampledChartData, a.action_date ?? '')
      const key = closest.date
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push({
        action: a,
        type: getChartCategory(a.type),
      })
    }
    return downsampledChartData.map((d) => ({
      ...d,
      decisions: byDate.get(d.date),
    }))
  }, [downsampledChartData, actionsInRange])

  const chartDisplayDataEnriched = useMemo(
    () => enrichChartDataWithClusters(mergedChartData),
    [mergedChartData]
  )

  const hasBenchmark = compareDataList.length > 0 && chartDataWithBenchmark.some((d) => {
    if (compareDataList.length === 1 && 'benchmarkNorm' in d) return (d as { benchmarkNorm?: number }).benchmarkNorm != null && (d as { benchmarkNorm: number }).benchmarkNorm > 0
    return compareDataList.some((b) => (d as Record<string, unknown>)[`compare_${b.symbol}`] != null)
  })
  const displayValueKey = hasBenchmark ? 'priceNorm' : 'price'

  const rangeSummary = useMemo(() => {
    if (!chartData.length) return null
    const first = chartData[0]
    const last = chartData[chartData.length - 1]
    if (!first?.price || !last?.price) return null
    const pctChange = ((last.price - first.price) / first.price) * 100
    const min = Math.min(...chartData.map((d) => d.price))
    const max = Math.max(...chartData.map((d) => d.price))
    // Annualised CAGR from the start date → end date. Skips sub-month ranges
    // where the number is noisy and misleading.
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

  const yAxisDomain = useMemo(() => {
    if (chartDisplayDataEnriched.length === 0) return undefined
    const values: number[] = []
    chartDisplayDataEnriched.forEach((d) => {
      const v = hasBenchmark ? (d as { priceNorm?: number }).priceNorm : d.price
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
      if (hasBenchmark && compareDataList.length === 1 && typeof (d as { benchmarkNorm?: number }).benchmarkNorm === 'number') {
        values.push((d as { benchmarkNorm: number }).benchmarkNorm)
      }
      if (hasBenchmark && compareDataList.length > 1) {
        compareDataList.forEach((b) => {
          const val = (d as unknown as Record<string, unknown>)[`compare_${b.symbol}`]
          if (typeof val === 'number' && Number.isFinite(val)) values.push(val)
        })
      }
    })
    if (values.length === 0) return undefined
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const padding = span * 0.15
    return [min - padding, max + padding] as [number, number]
  }, [chartDisplayDataEnriched, hasBenchmark, compareDataList])

  const rangeStats = useMemo((): RangeStats | null => {
    if (!measureSelection || mergedChartData.length === 0) return null
    const dataForStats = mergedChartData.map((d) => ({ date: d.date, price: (hasBenchmark ? d.priceNorm : d.price) ?? d.price }))
    return computeRangeStats(dataForStats, measureSelection.startIndex, measureSelection.endIndex)
  }, [measureSelection, mergedChartData, hasBenchmark])

  const [selecting, setSelecting] = useState<{ startX: number; endX: number } | null>(null)
  const [crosshairX, setCrosshairX] = useState<number | null>(null)

  const dataForStats = useMemo(
    () => mergedChartData.map((d) => ({ date: d.date, price: (hasBenchmark ? d.priceNorm : d.price) ?? d.price })),
    [mergedChartData, hasBenchmark]
  )

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
  }, [selecting, wrapperWidth, dataForStats])

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
  }, [loading, mergedChartData.length])

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
  const handleMeasureMouseUp = () => {
    if (!selecting || !chartWrapperRef.current) {
      setSelecting(null)
      return
    }
    if (Math.abs(selecting.endX - selecting.startX) < 20) {
      setSelecting(null)
      return
    }
    const rect = chartWrapperRef.current.getBoundingClientRect()
    const plotWidth = rect.width - plotLeft - plotRight
    if (plotWidth <= 0) {
      setSelecting(null)
      return
    }
    const dataLen = mergedChartData.length
    const [x1, x2] = selecting.startX < selecting.endX ? [selecting.startX, selecting.endX] : [selecting.endX, selecting.startX]
    const plotX1 = Math.max(0, x1 - plotLeft)
    const plotX2 = Math.min(plotWidth, x2 - plotLeft)
    const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
    let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
    if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, dataLen - 1)
    setMeasureSelection({ startIndex, endIndex })
    justFinishedDragRef.current = true
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
    if (!selecting || !chartWrapperRef.current) {
      setSelecting(null)
      return
    }
    if (Math.abs(selecting.endX - selecting.startX) < 20) {
      setSelecting(null)
      return
    }
    const rect = chartWrapperRef.current.getBoundingClientRect()
    const plotWidth = rect.width - plotLeft - plotRight
    if (plotWidth <= 0) {
      setSelecting(null)
      return
    }
    const dataLen = mergedChartData.length
    const [x1, x2] = selecting.startX < selecting.endX ? [selecting.startX, selecting.endX] : [selecting.endX, selecting.startX]
    const plotX1 = Math.max(0, x1 - plotLeft)
    const plotX2 = Math.min(plotWidth, x2 - plotLeft)
    const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
    let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
    if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, dataLen - 1)
    setMeasureSelection({ startIndex, endIndex })
    justFinishedDragRef.current = true
    setSelecting(null)
  }

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
          cursor: selecting ? 'crosshair' : 'crosshair',
          userSelect: selecting ? 'none' : 'auto',
          outline: 'none',
          '&:focus': { outline: 'none' },
          '& .recharts-wrapper': { outline: 'none' },
          '& .recharts-surface': { outline: 'none' },
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
          {wrapperWidth > 0 && wrapperHeight > 0 ? (
          <ResponsiveContainer width={wrapperWidth} height={wrapperHeight}>
            <ComposedChart
              data={chartDisplayDataEnriched}
              margin={{ top: plotTop, right: plotRight, left: plotLeft, bottom: plotBottom }}
              onClick={() => {
                if (justFinishedDragRef.current) {
                  justFinishedDragRef.current = false
                  return
                }
                setMeasureSelection(null)
              }}
              onDoubleClick={() => setMeasureSelection(null)}
            >
              {/* Cone glow gradients — same shape language as the timeline page
                  and the popup ticker chart. Each ChartDot below paints a cone
                  using these gradient ids. */}
              <defs>
                <linearGradient id="ticker-buy-glow" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stopColor={DECISION_COLORS.buy} stopOpacity="0.85" />
                  <stop offset="0.35" stopColor={DECISION_COLORS.buy} stopOpacity="0.55" />
                  <stop offset="1" stopColor={DECISION_COLORS.buy} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="ticker-sell-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={DECISION_COLORS.sell} stopOpacity="0.85" />
                  <stop offset="0.35" stopColor={DECISION_COLORS.sell} stopOpacity="0.55" />
                  <stop offset="1" stopColor={DECISION_COLORS.sell} stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={GRID_OPACITY} stroke="#cbd5e1" />
              {measureSelection != null && yAxisDomain && mergedChartData[measureSelection.startIndex] && mergedChartData[measureSelection.endIndex] && (
                <ReferenceArea
                  x1={mergedChartData[measureSelection.startIndex].date}
                  x2={mergedChartData[measureSelection.endIndex].date}
                  y1={yAxisDomain[0]}
                  y2={yAxisDomain[1]}
                  fill="rgba(59, 130, 246, 0.12)"
                  stroke="none"
                  strokeWidth={0}
                />
              )}
              <XAxis
                dataKey="date"
                tick={<CustomXAxisTick rotation={xAxisRotation} fontSize={axisFontSize} />}
                axisLine={{ stroke: '#64748b' }}
                tickLine={{ stroke: '#94a3b8' }}
                interval={Math.max(0, Math.floor(chartDisplayDataEnriched.length / (chartIsNarrow ? 5 : 8)) - 1)}
                height={xAxisHeight}
              />
              <YAxis
                domain={yAxisDomain ?? ['auto', 'auto']}
                tick={{ fontSize: axisFontSize, fill: '#334155' }}
                tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(0) : v)}
                axisLine={{ stroke: '#64748b' }}
                tickLine={{ stroke: '#94a3b8' }}
                width={plotLeft}
              />
              <Tooltip
                contentStyle={{ fontSize: FONT_SIZE_TOOLTIP, padding: 0 }}
                content={({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ name?: string; value?: number; payload?: unknown }>; label?: string | number }) => (
                  <TooltipContent active={active} payload={payload} label={label} symbol={displaySymbol} benchmarkSymbol={hasBenchmark ? compareSymbols[0] : undefined} />
                )}
              />
              <Legend wrapperStyle={{ fontSize: FONT_SIZE_AXIS }} />
              {hasBenchmark && compareDataList.length === 1 && (
                <Line
                  type="monotone"
                  dataKey="benchmarkNorm"
                  name={`$${compareSymbols[0]}`}
                  stroke={BENCHMARK_LINE_COLOR}
                  strokeWidth={BENCHMARK_LINE_WIDTH}
                  connectNulls
                  dot={false}
                  strokeDasharray="4 2"
                />
              )}
              {hasBenchmark && compareDataList.length > 1 && compareDataList.map((b, i) => (
                <Line
                  key={b.symbol}
                  type="monotone"
                  dataKey={`compare_${b.symbol}` as keyof typeof chartDisplayDataEnriched[0]}
                  name={`$${b.symbol}`}
                  stroke={[BENCHMARK_LINE_COLOR, BENCHMARK_LINE_COLOR, '#6366f1'][i % 3]}
                  strokeWidth={BENCHMARK_LINE_WIDTH}
                  connectNulls
                  dot={false}
                  strokeDasharray={i === 0 ? '4 2' : i === 1 ? '1 3' : '8 2'}
                />
              ))}
              <Line
                type="monotone"
                dataKey={displayValueKey}
                name={displaySymbol}
                stroke={CHART_LINE_COLOR}
                strokeWidth={CHART_LINE_WIDTH}
                connectNulls
                dot={(dotProps: Record<string, unknown>) => {
                  const pt = dotProps.payload as ChartPointEnriched | undefined
                  if (!pt?.decisions?.length && pt?._clusterRep !== true) return <circle key={dotProps.key as string} r={0} />
                  return <ChartDot cx={dotProps.cx as number} cy={dotProps.cy as number} payload={pt} />
                }}
                activeDot={false}
              />
          </ComposedChart>
        </ResponsiveContainer>
          ) : null}
        </Box>
        {crosshairX != null && !selecting && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 9,
            }}
          >
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
        {selecting && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: Math.min(selecting.startX, selecting.endX),
                width: Math.abs(selecting.endX - selecting.startX),
                bgcolor: 'rgba(59, 130, 246, 0.1)',
                borderRadius: 0,
              }}
            />
          </Box>
        )}
        {(() => {
          const stats = selecting ? liveSelectionStats : rangeStats
          const showTooltip = (selecting && liveSelectionStats) || (measureSelection && rangeStats && wrapperWidth > 0)
          if (!showTooltip || !stats) return null
          let tooltipLeft = selecting
            ? (selecting.startX + selecting.endX) / 2
            : plotLeft + ((measureSelection!.startIndex + measureSelection!.endIndex) / 2 / Math.max(1, mergedChartData.length)) * (wrapperWidth - plotLeft - plotRight)
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
