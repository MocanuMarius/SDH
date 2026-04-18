/**
 * Timeline chart with visx Brush for range selection.
 * Hovering an arrow fetches & overlays ticker price lines anchored to the arrow date.
 */

import { useMemo, useState, useCallback, useEffect, useId, useRef, memo } from 'react'
import { Group } from '@visx/group'
import { scaleTime, scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft, AxisRight } from '@visx/axis'
import { Brush } from '@visx/brush'
import { Box, Paper, Typography, CircularProgress } from '@mui/material'
import type { ActionWithEntry } from '../services/actionsService'
import { fetchChartData } from '../services/chartApiService'
import { getDecisionTypeColor, getDecisionTypeConfig } from '../theme/decisionTypes'
import { DecisionMarkerGradients, conePath, getMarkerGeom, clusterDotRadius } from './charts/decisionMarkers'
import { tokens } from '../theme'

const CHART_LINE_COLOR = '#334155'
const AXIS_COLOR = '#64748b'
const GRID_COLOR = '#cbd5e1'
// Marker colours pulled from theme tokens so a future palette tweak is a
// one-token change. Local aliases kept (renaming all sites would explode
// this diff). Same names are re-exported by decisionMarkers.tsx so the
// other charts also stay in sync.
const ARROW_BUY_COLOR = tokens.markerBuy
const ARROW_SELL_COLOR = tokens.markerSell
const ARROW_GREYED = tokens.markerGreyed

// Distinct, readable colors on white — avoid green/red (used for arrows)
const TICKER_COLORS = [
  '#2563eb', // blue
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#b45309', // brown
  '#9333ea', // purple
  '#0369a1', // sky
  '#a16207', // yellow-dark
]

// Marker geometry (getMarkerGeom, MarkerGeom type) and the variable-size
// cone-path / cluster-radius math now live in `charts/decisionMarkers.tsx`
// alongside the dot/gradient primitives so all three charts can grow into
// the same scale without re-deriving breakpoints.

export interface TimelineChartPoint {
  date: string
  price: number
  decisions?: Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>
  _counts?: { buy: number; sell: number; other: number }
  _total?: number
}

// Right margin now reserves room for the second Y axis (% growth since start
// of visible period), so it's wider than the old price-only layout.
const margin = { top: 24, right: 52, bottom: 24, left: 52 }

export function getTimelineChartResponsiveMargin(width: number) {
  if (width < 400) return { top: 24, right: 40, bottom: 24, left: 40 }
  if (width < 600) return { top: 24, right: 44, bottom: 24, left: 44 }
  return margin
}

interface ArrowInfo {
  point: TimelineChartPoint
  direction: 'buy' | 'sell'
  ticker: string        // comma-separated
  tickers: string[]     // parsed list
  count: number
  cx: number
  cy: number
  key: string           // unique cluster key for hover highlight
}

interface TickerLine {
  ticker: string
  color: string
  // mappedPrice = spyAnchorPrice * (tickerPrice / tickerPriceAtEntry) — on SPY's price scale
  points: { date: string; mappedPrice: number }[]
  pctChange: number  // final % change from entry to last point
}

export interface TimelineChartVisxProps {
  data: TimelineChartPoint[]
  symbol: string
  yDomain: [number, number]
  width: number
  height: number
  selectedActionId: string | null
  selectedTicker: string | null
  onSelectAction: (id: string | null) => void
  onChartClick: () => void
  onMouseLeave: () => void
  onBrushChange?: (start: number, end: number) => void
  /** Hide the brush rail at the bottom. Used by smaller embeddings (e.g. the
   *  popup chart) where the brush would be visual noise. Defaults to true. */
  showBrush?: boolean
  /** Always-on benchmark overlays. Each benchmark is anchored to the first
   *  date in the data window and mapped onto the ticker's price scale (same
   *  trick as the click-fetched overlay tickers). Used by the popup chart
   *  (single benchmark) and the per-ticker page (up to 3 stacked compares)
   *  where the user wants to see ticker-vs-benchmark(s) in one view without
   *  first clicking a decision marker. Pass `[]` or `null` to hide. */
  benchmarkData?: Array<{ ticker: string; dates: string[]; prices: number[] }> | null
  /** Suppress the click-to-overlay-tickers behaviour. Marker clicks still
   *  call `onSelectAction` for selection, but no fetched overlay is drawn.
   *  Used by the popup chart where the benchmark is already always-on so a
   *  click overlay would be redundant. */
  disableMarkerClick?: boolean
  /** Fired when the user clicks a multi-marker cluster. The chart computes
   *  a new index range (within `data`) that, when used as the visible
   *  window, will spread the cluster's markers far enough apart to read
   *  individually. The embedder can apply this to its own zoom state to
   *  drill into the cluster (timeline page does this; popup ignores). */
  onClusterZoom?: (startIndex: number, endIndex: number) => void
  /** Fired whenever the click-to-inspect decision overlay's content
   *  changes. The embedder can render the overlay OUTSIDE the chart's
   *  plot area (e.g. as a banner over the range-selector bar) so it
   *  doesn't cover the timeline. Pass null when the user dismisses.
   *
   *  When set, the chart suppresses its own in-plot Paper tooltip and
   *  relies on the embedder's rendering. */
  onDecisionOverlayChange?: (overlay: DecisionOverlayInfo | null) => void
}

/** Payload for the embedder-rendered decision overlay. Mirrors what the
 *  in-chart Paper tooltip used to show — direction + counts + tickers +
 *  fetched ticker-line returns — so the embedder can reproduce it in its
 *  own chrome without depending on chart-internal types. */
export interface DecisionOverlayInfo {
  direction: 'buy' | 'sell'
  /** Total decisions represented by the clicked cluster. */
  count: number
  /** The chart point under the clicked marker. */
  date: string
  price: number
  /** The parent chart's primary symbol ("SPY", "UBER", …). */
  symbol: string
  /** Tickers whose overlays we're fetching / have fetched. */
  tickers: string[]
  /** Per-ticker return since `date`; populated after the chart fetches
   *  their overlay lines. Empty while `fetching === true`. */
  lines: Array<{ ticker: string; color: string; pctChange: number }>
  /** True while chart data for the overlay tickers is in flight. */
  fetching: boolean
}

const BRUSH_HEIGHT = 40
const TOOLTIP_W = 230
const TOOLTIP_H_EST = 170

function TimelineChartVisx({
  data,
  symbol,
  yDomain,
  width,
  height,
  selectedActionId,
  selectedTicker,
  onSelectAction,
  onChartClick,
  onMouseLeave,
  onBrushChange,
  showBrush = true,
  benchmarkData = null,
  disableMarkerClick = false,
  onClusterZoom,
  onDecisionOverlayChange,
}: TimelineChartVisxProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)   // hover highlight only
  const [activeArrow, setActiveArrow] = useState<ArrowInfo | null>(null)  // click → overlay
  const [tickerLines, setTickerLines] = useState<TickerLine[]>([])
  const [fetchingOverlay, setFetchingOverlay] = useState(false)

  const responsiveMargin = getTimelineChartResponsiveMargin(width)
  const innerWidth = Math.max(0, width - responsiveMargin.left - responsiveMargin.right)
  const innerHeight = Math.max(0, height - responsiveMargin.top - responsiveMargin.bottom - (showBrush ? BRUSH_HEIGHT : 0))

  const isMobile = width < 600
  // Axis labels deliberately small so the plot area gets maximum
  // horizontal + vertical real estate. Mobile drops one more pt since
  // every pixel counts on narrow screens.
  const axisLabelFontSize = isMobile ? 9 : 10
  const leftAxisLabelFontSize = isMobile ? 10 : 11
  const numBottomTicks = width > 400 ? 8 : 5
  const markerGeom = useMemo(() => getMarkerGeom(width), [width])
  // CONE_HEIGHT_MAX is still used for cluster bbox sizing; CONE_HALFWIDTH_MAX
  // used to bound MIN_GAP but the new tighter clustering uses DOT_R-based
  // spacing instead, so the half-width constant is no longer needed here.
  const { DOT_R, DOT_STROKE, CONE_HEIGHT_MAX, CONE_SIZE } = markerGeom
  // Stable id suffix for SVG <defs> — prevents collisions when multiple
  // TimelineChartVisx instances are on screen at the same time.
  const chartId = useId()

  const dateScale = useMemo(
    () =>
      scaleTime({
        domain: data.length > 0
          ? [new Date(data[0].date), new Date(data[data.length - 1].date)]
          : ([new Date(0), new Date(1)] as [Date, Date]),
        range: [0, innerWidth],
      }),
    [data, innerWidth]
  )

  // Always-on benchmark overlays: each is anchored to the first data point's
  // price and mapped to the main chart's y-scale (same trick as the click-
  // fetched overlay ticker lines below). Lets the popup and per-ticker page
  // show ticker-vs-benchmark(s) without first clicking a marker.
  const benchmarkLines: TickerLine[] = useMemo(() => {
    if (!benchmarkData?.length || data.length === 0) return []
    const firstDataDate = data[0].date
    const firstDataPrice = data[0].price
    if (!firstDataPrice || firstDataPrice <= 0) return []
    // Each benchmark gets a slightly different shade of slate so the eye
    // can tell them apart in a multi-compare. Order is the input order.
    const COLORS = [tokens.markerBenchmark, tokens.markerBenchmarkAlt, tokens.markerBenchmarkAlt2]
    const lines: TickerLine[] = []
    for (let bi = 0; bi < benchmarkData.length; bi++) {
      const bench = benchmarkData[bi]
      if (!bench?.dates?.length) continue
      const b0Idx = bench.dates.findIndex((d) => d >= firstDataDate)
      if (b0Idx < 0) continue
      const b0 = bench.prices[b0Idx]
      if (!b0 || b0 <= 0) continue
      const points = bench.dates
        .slice(b0Idx)
        .map((date, i) => {
          const price = bench.prices[b0Idx + i]
          if (!price || price <= 0) return null
          return { date, mappedPrice: firstDataPrice * (price / b0) }
        })
        .filter((p): p is { date: string; mappedPrice: number } => p !== null)
      if (points.length < 2) continue
      const lastMapped = points[points.length - 1].mappedPrice
      const pctChange = ((lastMapped - firstDataPrice) / firstDataPrice) * 100
      lines.push({
        ticker: bench.ticker,
        color: COLORS[bi % COLORS.length],
        points,
        pctChange,
      })
    }
    return lines
  }, [benchmarkData, data])

  // All overlays = always-on benchmark(s) + click-fetched ticker lines.
  // They share the y-domain expansion logic and the line-end label rendering.
  const allOverlayLines = useMemo(() => {
    return benchmarkLines.length ? [...benchmarkLines, ...tickerLines] : tickerLines
  }, [benchmarkLines, tickerLines])

  // Expand yDomain to fit overlay lines when active. 12% padding (was
  // 8%) gives noticeable breathing room between the lowest/highest
  // overlay point and the plot edges, so a click-fetched ticker that's
  // -8% from the anchor doesn't visually crash into the bottom axis.
  const activeDomain = useMemo((): [number, number] => {
    if (allOverlayLines.length === 0) return yDomain
    const allMapped = allOverlayLines.flatMap((tl) => tl.points.map((p) => p.mappedPrice))
    if (!allMapped.length) return yDomain
    const minMapped = Math.min(...allMapped)
    const maxMapped = Math.max(...allMapped)
    const pad = (yDomain[1] - yDomain[0]) * 0.12
    return [
      Math.min(yDomain[0], minMapped - pad),
      Math.max(yDomain[1], maxMapped + pad),
    ]
  }, [yDomain, allOverlayLines])

  // .nice() rounds the scale's domain to round tick values so the
  // y-axis labels cover the full visual range. Without this, d3 picks
  // ticks INSIDE the domain (e.g. [640, 650, 660, 670, 680, 690] when
  // the domain is [615, 700]) — the chart line then runs below the
  // lowest tick label into 30+ px of unlabeled empty space, which the
  // user sees as "the chart going below the y-axis".
  const priceScale = useMemo(
    () =>
      scaleLinear({
        domain: activeDomain,
        range: [innerHeight, 0],
        clamp: false,
        nice: true,
      }),
    [activeDomain, innerHeight]
  )

  const brushDateScale = useMemo(
    () =>
      scaleTime({
        domain: data.length > 0
          ? [new Date(data[0].date), new Date(data[data.length - 1].date)]
          : ([new Date(0), new Date(1)] as [Date, Date]),
        range: [0, innerWidth],
      }),
    [data, innerWidth]
  )

  const brushPriceScale = useMemo(
    () => scaleLinear({ domain: yDomain, range: [BRUSH_HEIGHT, 0] }),
    [yDomain]
  )

  const linePath = useMemo(() => {
    const points = data
      .filter((d) => typeof d.price === 'number' && Number.isFinite(d.price))
      .map((d) => ({ x: dateScale(new Date(d.date)), y: priceScale(d.price) }))
    if (points.length < 2) return ''
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [data, dateScale, priceScale])

  const brushLinePath = useMemo(() => {
    const points = data
      .filter((d) => typeof d.price === 'number' && Number.isFinite(d.price))
      .map((d) => ({ x: brushDateScale(new Date(d.date)), y: brushPriceScale(d.price) }))
    if (points.length < 2) return ''
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [data, brushDateScale, brushPriceScale])

  // Fetch ticker overlay lines when an arrow is clicked
  useEffect(() => {
    if (!activeArrow || activeArrow.tickers.length === 0) {
      setTickerLines([])
      return
    }

    const arrowDate = activeArrow.point.date
    const spyAnchorPrice = activeArrow.point.price
    const endDate = data.length > 0 ? data[data.length - 1].date : ''
    if (!endDate) return

    setFetchingOverlay(true)
    setTickerLines([])

    const tickers = activeArrow.tickers.slice(0, TICKER_COLORS.length)

    Promise.all(
      tickers.map(async (ticker, idx) => {
        try {
          const result = await fetchChartData(ticker, '5y', { startDate: arrowDate, endDate })
          if (!result.dates.length) return null

          // Find the ticker's price at or after the arrow date
          const p0Idx = result.dates.findIndex((d) => d >= arrowDate)
          if (p0Idx < 0) return null
          const p0 = result.prices[p0Idx]
          if (!p0 || p0 <= 0) return null

          // Map each date to a price on SPY's scale: spyAnchorPrice * (tickerPrice / p0)
          const points = result.dates
            .slice(p0Idx)
            .map((date, i) => {
              const price = result.prices[p0Idx + i]
              if (!price || price <= 0) return null
              const mappedPrice = spyAnchorPrice * (price / p0)
              return { date, mappedPrice }
            })
            .filter((p): p is { date: string; mappedPrice: number } => p !== null)

          const lastMapped = points[points.length - 1]?.mappedPrice ?? spyAnchorPrice
          const pctChange = ((lastMapped - spyAnchorPrice) / spyAnchorPrice) * 100

          return {
            ticker,
            color: TICKER_COLORS[idx % TICKER_COLORS.length],
            points,
            pctChange,
          } as TickerLine
        } catch {
          return null
        }
      })
    ).then((results) => {
      setTickerLines(results.filter((r): r is TickerLine => r !== null))
      setFetchingOverlay(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArrow?.point.date, activeArrow?.ticker])

  // Notify the embedder when the overlay state changes, so it can render
  // the decision banner outside the chart (e.g. over the range-selector).
  useEffect(() => {
    if (!onDecisionOverlayChange) return
    if (!activeArrow) {
      onDecisionOverlayChange(null)
      return
    }
    onDecisionOverlayChange({
      direction: activeArrow.direction,
      count: activeArrow.count,
      date: activeArrow.point.date,
      price: activeArrow.point.price,
      symbol,
      tickers: activeArrow.tickers,
      lines: tickerLines.map((tl) => ({ ticker: tl.ticker, color: tl.color, pctChange: tl.pctChange })),
      fetching: fetchingOverlay,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArrow, tickerLines, fetchingOverlay, symbol])

  const handleBackgroundClick = useCallback(() => {
    setActiveArrow(null)
    setTickerLines([])
    onChartClick()
  }, [onChartClick])

  // Global click-outside listener — any click that isn't inside this chart
  // container closes the active overlay. (The in-chart background rect already
  // handles clicks on empty plot area, but clicking the page, sidebar, list
  // items, etc. used to leave the overlay open indefinitely.)
  const chartBoxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!activeArrow) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (chartBoxRef.current && chartBoxRef.current.contains(target)) return
      setActiveArrow(null)
      setTickerLines([])
    }
    // `click` (not `mousedown`) so clicks inside a list item that also
    // programmatically opens an overlay don't immediately close it.
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [activeArrow])

  // Sync activeArrow from an externally set selectedActionId (e.g. clicking
  // an "Entries in range" list item below the chart). Finds the data point
  // that carries that action and opens the overlay for it.
  useEffect(() => {
    if (!selectedActionId || disableMarkerClick) return
    // Don't reopen if we're already showing this action.
    if (activeArrow && activeArrow.key === `ext-${selectedActionId}`) return
    for (const pt of data) {
      const decisions = pt.decisions ?? []
      const match = decisions.find((d) => d.action.id === selectedActionId)
      if (!match) continue
      // Only open for directional types — pass/research/hold/watchlist don't
      // have ticker-overlay behaviour on this chart.
      const dir: 'buy' | 'sell' = match.type === 'sell' ? 'sell' : 'buy'
      const ticker = (match.action.ticker ?? '').toUpperCase()
      if (!ticker) return
      setActiveArrow({
        point: pt,
        direction: dir,
        ticker,
        tickers: [ticker],
        count: 1,
        cx: dateScale(new Date(pt.date)),
        cy: priceScale(pt.price),
        key: `ext-${selectedActionId}`,
      })
      return
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActionId])

  const handleBrushChange = useCallback(
    (domain: { x0: number; x1: number } | null) => {
      if (!domain || !onBrushChange) return
      const startIdx = Math.max(0, Math.floor(domain.x0))
      const endIdx = Math.min(data.length - 1, Math.ceil(domain.x1))
      onBrushChange(startIdx, endIdx)
    },
    [data.length, onBrushChange]
  )

  // Smart tooltip position — never overflow left/right/top of chart
  const tooltipPos = useMemo(() => {
    if (!activeArrow) return { left: 0, top: 0 }
    const anchorX = responsiveMargin.left + activeArrow.cx
    const anchorY = responsiveMargin.top + activeArrow.cy

    let left = anchorX - TOOLTIP_W / 2
    left = Math.max(4, Math.min(width - TOOLTIP_W - 4, left))

    let top: number
    // Tooltip sits past the longest possible cone tip (we don't know the
    // exact size of the active cluster's cone from here, so use the max).
    if (activeArrow.direction === 'buy') {
      top = anchorY - CONE_HEIGHT_MAX - TOOLTIP_H_EST - 8
      if (top < 4) top = anchorY + CONE_HEIGHT_MAX + 8
    } else {
      top = anchorY + CONE_HEIGHT_MAX + 8
      if (top + TOOLTIP_H_EST > height - 4) top = anchorY - CONE_HEIGHT_MAX - TOOLTIP_H_EST - 8
    }
    top = Math.max(4, top)

    return { left, top }
  }, [activeArrow, width, height, responsiveMargin, CONE_HEIGHT_MAX])

  if (width < 10 || height < 10) return null

  return (
    <Box
      ref={chartBoxRef}
      sx={{ position: 'relative', width, height }}
      onMouseLeave={() => {
        setHoveredKey(null)
        onMouseLeave()
      }}
    >
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          {/* Clip glows to the plot area so they don't spill past the axes. */}
          <clipPath id={`plot-clip-${chartId}`}>
            <rect x={0} y={0} width={innerWidth} height={innerHeight} />
          </clipPath>
          {/* Shared cone gradients — same defs as ticker chart and popup so
              all three render with one shape language. The chartId-based
              prefix lets multiple TimelineChartVisx instances coexist. */}
          <DecisionMarkerGradients idPrefix={chartId} />
        </defs>
        <Group left={responsiveMargin.left} top={responsiveMargin.top}>
          {/* Grid lines */}
          {priceScale.ticks(5).map((tick) => (
            <line key={tick}
              x1={0} x2={innerWidth} y1={priceScale(tick)} y2={priceScale(tick)}
              stroke={GRID_COLOR} strokeWidth={1} strokeDasharray="3 3" opacity={0.25}
            />
          ))}

          {/* Main SPY price line */}
          <path d={linePath} fill="none" stroke={CHART_LINE_COLOR} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Overlay lines — always-on benchmark (if `benchmarkData` was passed)
              + click-fetched ticker lines. Same drawing for both. */}
          {allOverlayLines.map((tl) => {
            if (tl.points.length < 2) return null
            const d = tl.points.map((p, i) => {
              const x = dateScale(new Date(p.date))
              const y = priceScale(p.mappedPrice)
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ')
            // Always-on benchmarks get a dashed stroke so they read as
            // "reference" vs the click-fetched solid overlays.
            const isBenchmark = benchmarkLines.includes(tl)
            return (
              <path key={tl.ticker} d={d} fill="none"
                stroke={tl.color} strokeWidth={isBenchmark ? 1.5 : 2}
                strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={isBenchmark ? '4 3' : undefined}
                opacity={isBenchmark ? 0.7 : 0.85}
                style={{ pointerEvents: 'none' }}
              />
            )
          })}

          {/* Benchmark end label — shown alongside the overlay ticker labels
              so the user can see the benchmark's own move at a glance. Only
              rendered when an overlay is up (to avoid clutter in the default
              view) and keyed off the last data point. */}
          {activeArrow && data.length > 0 && (() => {
            const lastPt = data[data.length - 1]
            const anchorPrice = activeArrow.point.price
            if (!anchorPrice || anchorPrice <= 0) return null
            const pct = ((lastPt.price - anchorPrice) / anchorPrice) * 100
            const sign = pct >= 0 ? '+' : ''
            const label = `${symbol} ${sign}${pct.toFixed(1)}%`
            const badgeW = label.length * 7 + 10
            const badgeH = 18
            const badgeX = Math.min(innerWidth - badgeW - 2, Math.max(2, dateScale(new Date(lastPt.date)) - badgeW / 2))
            const badgeY = priceScale(lastPt.price) + 12  // push below the line so it doesn't fight overlays
            const bgColor = pct >= 0 ? '#0f172a' : '#0f172a'  // benchmark stays neutral-dark
            return (
              <g key="label-benchmark" style={{ pointerEvents: 'none' }}>
                <rect x={badgeX} y={badgeY} width={badgeW} height={badgeH} rx={4} fill={bgColor} />
                <text x={badgeX + badgeW / 2} y={badgeY + badgeH / 2}
                  fill="#fff" fontSize={10} fontWeight={800}
                  textAnchor="middle" dominantBaseline="middle" style={{ userSelect: 'none' }}>
                  {label}
                </text>
              </g>
            )
          })()}

          {/* Overlay end labels — one per overlay line. Same renderer for the
              always-on benchmark and the click-fetched tickers. */}
          {allOverlayLines.map((tl) => {
            if (tl.points.length === 0) return null
            const last = tl.points[tl.points.length - 1]
            const pct = tl.pctChange
            const sign = pct >= 0 ? '+' : ''
            const label = `${tl.ticker} ${sign}${pct.toFixed(1)}%`
            const badgeW = label.length * 7 + 10
            const badgeH = 18
            // Pin badge to right edge, clamped
            const badgeX = Math.min(innerWidth - badgeW - 2, Math.max(2, dateScale(new Date(last.date)) - badgeW / 2))
            const badgeY = priceScale(last.mappedPrice) - badgeH / 2
            // Dark solid color: darken by mixing with black. Benchmarks stay
            // neutral-dark since they're references, not comparison results.
            const isBenchmark = benchmarkLines.includes(tl)
            const bgColor = isBenchmark ? '#1e293b' : pct >= 0 ? '#14532d' : '#7f1d1d'
            return (
              <g key={`label-${tl.ticker}`} style={{ pointerEvents: 'none' }}>
                {/* Connector dot at line end */}
                <circle cx={dateScale(new Date(last.date))} cy={priceScale(last.mappedPrice)}
                  r={3} fill={tl.color} />
                {/* Badge background */}
                <rect x={badgeX} y={badgeY} width={badgeW} height={badgeH} rx={4}
                  fill={bgColor} />
                {/* Badge text: TICKER +X.X% */}
                <text x={badgeX + badgeW / 2} y={badgeY + badgeH / 2}
                  fill="#fff" fontSize={10} fontWeight={800}
                  textAnchor="middle" dominantBaseline="middle" style={{ userSelect: 'none' }}>
                  {label}
                </text>
              </g>
            )
          })}

          {/* Anchor dot on SPY line when active */}
          {activeArrow && (
            <circle
              cx={activeArrow.cx}
              cy={priceScale(activeArrow.point.price)}
              r={5}
              fill="#0f172a"
              stroke="#fff"
              strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Background click area */}
          <rect x={0} y={0} width={innerWidth} height={innerHeight}
            fill="transparent" onClick={handleBackgroundClick} />

          {/* Buy/sell markers: coloured dots on the price line + light-cone
              glows radiating up (buys) or down (sells). Cone height scales
              with trade size (tiny → xl). Overlapping cones are rendered in
              a <g> with `mix-blend-mode: multiply`, which on a light chart
              background darkens/saturates the overlap — the "constructive
              interference" effect that reads as "more activity here".
              Per-cluster hit rectangles drive click/hover. */}
          {(() => {
            // Cluster threshold — slightly above the "dots would touch"
            // check. Small enough that the smart-merge algorithm below can
            // actually keep most markers separate; big enough that when two
            // dots land within each other's personal space, they still get
            // merged into a tappable cluster.
            const MIN_GAP = DOT_R * 2 + 6

            interface Marker {
              cx: number; priceY: number; point: TimelineChartPoint
              buyCount: number; sellCount: number
              buyFirstId: string | null; sellFirstId: string | null
              buyTickers: string[]; sellTickers: string[]
              /** Largest size among buys on this marker — drives cone height. */
              buyMaxSize: import('../types/database').ActionSize
              sellMaxSize: import('../types/database').ActionSize
              /** True if ANY buy on this marker is a primary action (buy/short/speculate)
               *  rather than an adjustment (add_more/cover/trim). Drives dot style
               *  (filled vs ringed). */
              buyIsPrimary: boolean
              sellIsPrimary: boolean
            }
            // An "entry" buy or a "full sell" is a primary — visually filled.
            // Adjustments (add_more / trim / cover) show as ringed dots so the
            // user can distinguish at a glance between opening/closing a
            // position and merely scaling it.
            const PRIMARY_TYPES = new Set(['buy', 'sell', 'short', 'speculate'])
            const hasPrimary = (arr: { action: { type: string } }[]) =>
              arr.some((d) => PRIMARY_TYPES.has(d.action.type))
            const sizeRank: Record<import('../types/database').ActionSize, number> = {
              tiny: 0, small: 1, medium: 2, large: 3, xl: 4,
            }
            const maxSize = (
              arr: { action: { size?: string | null } }[],
              fallback: import('../types/database').ActionSize = 'medium',
            ): import('../types/database').ActionSize => {
              let best = fallback
              for (const d of arr) {
                const s = (d.action.size as import('../types/database').ActionSize | null | undefined) ?? 'medium'
                if (sizeRank[s] > sizeRank[best]) best = s
              }
              return best
            }
            const markers: Marker[] = data.flatMap((pt) => {
              const decisions = pt.decisions ?? []
              const buys = decisions.filter((d) => d.type === 'buy')
              const sells = decisions.filter((d) => d.type === 'sell')
              if (!buys.length && !sells.length) return []
              return [{
                cx: dateScale(new Date(pt.date)),
                priceY: priceScale(pt.price),
                point: pt,
                buyCount: buys.length,
                sellCount: sells.length,
                buyFirstId: buys[0]?.action.id ?? null,
                sellFirstId: sells[0]?.action.id ?? null,
                buyTickers: [...new Set(buys.map((d) => (d.action.ticker ?? '').toUpperCase()).filter(Boolean))],
                sellTickers: [...new Set(sells.map((d) => (d.action.ticker ?? '').toUpperCase()).filter(Boolean))],
                buyMaxSize: buys.length ? maxSize(buys) : 'medium',
                sellMaxSize: sells.length ? maxSize(sells) : 'medium',
                buyIsPrimary: buys.length ? hasPrimary(buys) : false,
                sellIsPrimary: sells.length ? hasPrimary(sells) : false,
              }]
            })

            /**
             * Smart clustering — maximise the number of visible points
             * subject to the constraint that no two adjacent cluster
             * centroids are closer than MIN_GAP pixels.
             *
             * The old greedy left-to-right sweep would fold an entire
             * chain of 12px-apart dots into ONE cluster, even when the
             * total span was 400px wide. That under-used the available
             * horizontal room dramatically.
             *
             * New algorithm: start with every marker as its own cluster,
             * then repeatedly merge the TIGHTEST adjacent pair (smallest
             * centroid gap) until every remaining gap ≥ MIN_GAP. This is
             * equivalent to hierarchical clustering with a distance
             * threshold — it leaves as many points separate as the
             * threshold allows, and only merges the points that really
             * need merging.
             *
             * Complexity: O(N²) worst case, N ≤ ~96 per chart → trivial.
             */
            function clusterDir(dir: 'buy' | 'sell'): Marker[][] {
              const relevant = markers.filter((m) => (dir === 'buy' ? m.buyCount : m.sellCount) > 0)
              if (!relevant.length) return []
              // Sort by x so cluster indices align with time order — a
              // cluster is always a contiguous run of adjacent dates.
              const sorted = [...relevant].sort((a, b) => a.cx - b.cx)
              // Each cluster tracks its members + their avg cx (centroid).
              const clusters: { members: Marker[]; avgCx: number }[] = sorted.map((m) => ({
                members: [m],
                avgCx: m.cx,
              }))

              // Merge the tightest adjacent pair until all gaps clear.
              // Bounded by `clusters.length` iterations since each merge
              // reduces the count by one.
              while (clusters.length > 1) {
                let tightestIdx = -1
                let tightestGap = MIN_GAP
                for (let i = 0; i < clusters.length - 1; i++) {
                  const gap = clusters[i + 1].avgCx - clusters[i].avgCx
                  if (gap < tightestGap) {
                    tightestGap = gap
                    tightestIdx = i
                  }
                }
                if (tightestIdx === -1) break
                // Merge tightestIdx + (tightestIdx+1). New centroid =
                // weighted average (by member count) of the two.
                const a = clusters[tightestIdx]
                const b = clusters[tightestIdx + 1]
                const merged: { members: Marker[]; avgCx: number } = {
                  members: [...a.members, ...b.members],
                  avgCx:
                    (a.avgCx * a.members.length + b.avgCx * b.members.length) /
                    (a.members.length + b.members.length),
                }
                clusters.splice(tightestIdx, 2, merged)
              }

              return clusters.map((c) => c.members)
            }

            const buyGroups = clusterDir('buy')
            const sellGroups = clusterDir('sell')
            const els: React.ReactElement[] = []

            const buyMarkers = markers.filter((m) => m.buyCount > 0)
            const sellMarkers = markers.filter((m) => m.sellCount > 0)

            // Ticker filter applied to whole markers (same logic as old arrows).
            const isBuyMarkerGreyed = (m: Marker) => selectedTicker != null
              && !(m.point.decisions ?? []).some((d) => d.type === 'buy' && (d.action.ticker ?? '').toUpperCase() === selectedTicker)
            const isSellMarkerGreyed = (m: Marker) => selectedTicker != null
              && !(m.point.decisions ?? []).some((d) => d.type === 'sell' && (d.action.ticker ?? '').toUpperCase() === selectedTicker)

            // Per-marker cone geometry: height from size, half-width = height * 0.5
            // (preserves ~45° cone angle at any size).
            const coneHeight = (s: import('../types/database').ActionSize) => CONE_SIZE[s]
            const coneHalfW = (s: import('../types/database').ActionSize) => Math.round(CONE_SIZE[s] * 0.5)

            // 1. Cones — wrapped in a <g> with clipPath so they stay inside
            //    the plot area, and mix-blend-mode: multiply so overlapping
            //    cones DARKEN (on a white bg that reads as "more saturated"
            //    — the constructive-interference effect the UX proposal asks
            //    for). Per-marker opacity also scales with count.
            els.push(
              <g key="cone-layer" clipPath={`url(#plot-clip-${chartId})`} style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }}>
                {buyMarkers.map((m, i) => {
                  const greyed = isBuyMarkerGreyed(m)
                  const h = coneHeight(m.buyMaxSize)
                  const hw = coneHalfW(m.buyMaxSize)
                  const op = greyed ? 0.18 : Math.min(0.95, 0.6 + (m.buyCount - 1) * 0.12)
                  return (
                    <path
                      key={`bc-${i}`}
                      d={conePath(m.cx, m.priceY, 'buy', h, hw)}
                      fill={greyed ? ARROW_GREYED : `url(#${chartId}-buy-glow)`}
                      opacity={op}
                    />
                  )
                })}
                {sellMarkers.map((m, i) => {
                  const greyed = isSellMarkerGreyed(m)
                  const h = coneHeight(m.sellMaxSize)
                  const hw = coneHalfW(m.sellMaxSize)
                  const op = greyed ? 0.18 : Math.min(0.95, 0.6 + (m.sellCount - 1) * 0.12)
                  return (
                    <path
                      key={`sc-${i}`}
                      d={conePath(m.cx, m.priceY, 'sell', h, hw)}
                      fill={greyed ? ARROW_GREYED : `url(#${chartId}-sell-glow)`}
                      opacity={op}
                    />
                  )
                })}
              </g>
            )

            // 2. Dots on the line — ONE dot per cluster. A singleton cluster
            //    looks like the original dot. A multi-marker cluster grows
            //    with sqrt(count) (so area scales linearly with count, not
            //    edge length) and shows the count in the centre. This makes
            //    busy ranges easy to tap on mobile without inflating
            //    invisible hit zones.
            //
            //    Three visual cases per cluster (buy-only / sell-only / mixed):
            //    - buy-only        → green dot
            //    - sell-only       → red dot
            //    - mixed (cluster has at least one buy AND at least one sell
            //      across its members) → split dot, green top + red bottom
            //
            //    Primary actions (buy / sell / short / speculate) get a solid
            //    fill. Secondary adjustments (add_more / trim / cover) get a
            //    hollow-ringed dot. With clusters, the cluster is "primary"
            //    if any contributing decision is primary.
            const anyHoverOrActiveDotInGroup = (group: Marker[], dir: 'buy' | 'sell') => {
              const key = dir === 'buy' ? `buy-${buyGroups.indexOf(group)}` : `sell-${sellGroups.indexOf(group)}`
              return hoveredKey === key || activeArrow?.key === key
            }

            // Wrapper around the shared `clusterDotRadius` so the call sites
            // below don't have to thread DOT_R every time.
            const clusterR = (count: number, hovered: boolean) => clusterDotRadius(count, DOT_R, hovered)

            // Cluster centroid: average of member cx; price-y is the price
            // at the centre-most member (so the dot still sits on the line,
            // not floating in space).
            const clusterCentroid = (group: Marker[]) => {
              const avgCx = group.reduce((s, m) => s + m.cx, 0) / group.length
              const repMarker = group.reduce((best, m) => Math.abs(m.cx - avgCx) < Math.abs(best.cx - avgCx) ? m : best, group[0])
              return { cx: avgCx, cy: repMarker.priceY, repMarker }
            }

            // Pre-compute a map from each marker → its (buy / sell) cluster
            // group, so we can quickly answer "is this a mixed cluster?"
            const clusterByMarker = (g: Marker[][]) => {
              const map = new Map<Marker, Marker[]>()
              g.forEach((group) => group.forEach((m) => map.set(m, group)))
              return map
            }
            // Only the sell-cluster lookup is consumed (when iterating buy
            // clusters we ask "does this buy cluster's shared marker also
            // belong to a sell cluster?"). A symmetric buy-cluster lookup
            // would be needed if we iterated sell clusters first.
            const sellClusterOf = clusterByMarker(sellGroups)

            // A cluster is "mixed" when its buy group and sell group share at
            // least one marker (i.e. that marker has both buy and sell
            // decisions). Track which clusters we've already rendered as
            // mixed so we don't render their buy half + sell half separately.
            const renderedMixedKeys = new Set<string>()

            buyGroups.forEach((bGroup, bi) => {
              const buyKey = `buy-${bi}`
              const buyCount = bGroup.reduce((s, m) => s + m.buyCount, 0)
              const greyed = bGroup.every((m) => isBuyMarkerGreyed(m))
              const primary = bGroup.some((m) => m.buyIsPrimary)
              const hovered = anyHoverOrActiveDotInGroup(bGroup, 'buy')
              const r = clusterR(buyCount, hovered)
              const innerR = Math.max(1, r - 1.75)
              const fill = greyed ? ARROW_GREYED : ARROW_BUY_COLOR
              const { cx, cy } = clusterCentroid(bGroup)

              // Detect a mixed cluster: any member of this buy group also
              // belongs to a sell group whose centroid is essentially at the
              // same x. We only mark mixed when the SAME marker has both
              // buy AND sell decisions (true overlap), to keep the visual
              // unambiguous.
              const sharedMarker = bGroup.find((m) => m.buyCount > 0 && m.sellCount > 0)
              const sellGroupForShared = sharedMarker ? sellClusterOf.get(sharedMarker) : undefined
              const isMixedCluster = !!sellGroupForShared
              if (isMixedCluster && sellGroupForShared) {
                const sellKey = `sell-${sellGroups.indexOf(sellGroupForShared)}`
                if (renderedMixedKeys.has(sellKey)) return
                renderedMixedKeys.add(buyKey)
                renderedMixedKeys.add(sellKey)
                const sellCount = sellGroupForShared.reduce((s, m) => s + m.sellCount, 0)
                const totalCount = buyCount + sellCount
                const greyedSell = sellGroupForShared.every((m) => isSellMarkerGreyed(m))
                const sellPrimary = sellGroupForShared.some((m) => m.sellIsPrimary)
                const hoveredEither = hovered || anyHoverOrActiveDotInGroup(sellGroupForShared, 'sell')
                const rMix = clusterR(totalCount, hoveredEither)
                const innerRMix = Math.max(1, rMix - 1.75)
                const topFill = greyed ? ARROW_GREYED : ARROW_BUY_COLOR
                const botFill = greyedSell ? ARROW_GREYED : ARROW_SELL_COLOR
                els.push(
                  <g key={`dot-mix-${buyKey}`} style={{ pointerEvents: 'none' }}>
                    <path d={`M ${cx - rMix} ${cy} A ${rMix} ${rMix} 0 0 1 ${cx + rMix} ${cy} Z`} fill={topFill} />
                    <path d={`M ${cx - rMix} ${cy} A ${rMix} ${rMix} 0 0 0 ${cx + rMix} ${cy} Z`} fill={botFill} />
                    {!primary && (
                      <path d={`M ${cx - innerRMix} ${cy} A ${innerRMix} ${innerRMix} 0 0 1 ${cx + innerRMix} ${cy} Z`} fill="#fff" />
                    )}
                    {!sellPrimary && (
                      <path d={`M ${cx - innerRMix} ${cy} A ${innerRMix} ${innerRMix} 0 0 0 ${cx + innerRMix} ${cy} Z`} fill="#fff" />
                    )}
                    <circle cx={cx} cy={cy} r={rMix} fill="none" stroke="#fff" strokeWidth={DOT_STROKE} />
                    {totalCount > 1 && (
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                        fontSize={Math.max(9, Math.round(rMix * 0.9))} fontWeight={800} fill="#fff"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {totalCount}
                      </text>
                    )}
                  </g>
                )
                return
              }

              renderedMixedKeys.add(buyKey)
              els.push(
                <g key={`dot-buy-${buyKey}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={DOT_STROKE} />
                  {!primary && <circle cx={cx} cy={cy} r={innerR} fill="#fff" />}
                  {buyCount > 1 && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.max(9, Math.round(r * 0.9))} fontWeight={800}
                      fill={primary ? '#fff' : ARROW_BUY_COLOR}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {buyCount}
                    </text>
                  )}
                </g>
              )
            })

            sellGroups.forEach((sGroup, si) => {
              const sellKey = `sell-${si}`
              if (renderedMixedKeys.has(sellKey)) return
              const sellCount = sGroup.reduce((s, m) => s + m.sellCount, 0)
              const greyed = sGroup.every((m) => isSellMarkerGreyed(m))
              const primary = sGroup.some((m) => m.sellIsPrimary)
              const hovered = anyHoverOrActiveDotInGroup(sGroup, 'sell')
              const r = clusterR(sellCount, hovered)
              const innerR = Math.max(1, r - 1.75)
              const fill = greyed ? ARROW_GREYED : ARROW_SELL_COLOR
              const { cx, cy } = clusterCentroid(sGroup)
              els.push(
                <g key={`dot-sell-${sellKey}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={DOT_STROKE} />
                  {!primary && <circle cx={cx} cy={cy} r={innerR} fill="#fff" />}
                  {sellCount > 1 && (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.max(9, Math.round(r * 0.9))} fontWeight={800}
                      fill={primary ? '#fff' : ARROW_SELL_COLOR}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {sellCount}
                    </text>
                  )}
                </g>
              )
            })

            // 3. Per-cluster invisible hit rectangles for click/hover. One
            //    rectangle covers the full cone region for that cluster. We
            //    size the rect by the cluster's largest cone so clicks land
            //    on the glow, not empty space beyond it.
            const addHitRect = (group: Marker[], dir: 'buy' | 'sell', gi: number) => {
              const clusterKey = `${dir}-${gi}`
              const isActive = activeArrow?.key === clusterKey
              const totalCount = group.reduce((s, m) => s + (dir === 'buy' ? m.buyCount : m.sellCount), 0)
              const avgCx = group.reduce((s, m) => s + m.cx, 0) / group.length
              const anchorY = dir === 'buy'
                ? Math.min(...group.map((m) => m.priceY))
                : Math.max(...group.map((m) => m.priceY))
              const tickers = [...new Set(group.flatMap((m) => dir === 'buy' ? m.buyTickers : m.sellTickers))]
              const firstId = dir === 'buy' ? group[0].buyFirstId : group[0].sellFirstId
              const repMarker = group.reduce((best, m) => Math.abs(m.cx - avgCx) < Math.abs(best.cx - avgCx) ? m : best, group[0])
              const clusterMaxH = Math.max(...group.map((m) => coneHeight(dir === 'buy' ? m.buyMaxSize : m.sellMaxSize)))
              const clusterMaxHW = Math.max(...group.map((m) => coneHalfW(dir === 'buy' ? m.buyMaxSize : m.sellMaxSize)))
              const xStart = Math.min(...group.map((m) => m.cx)) - clusterMaxHW - 4
              const xEnd = Math.max(...group.map((m) => m.cx)) + clusterMaxHW + 4
              const yStart = dir === 'buy' ? anchorY - clusterMaxH - 4 : anchorY - 4
              const ySize = clusterMaxH + 8
              const isHovered = hoveredKey === clusterKey && !isActive
              // Hover preview text: "1 buy" / "3 sells" + tickers (clipped to 3).
              // Shown above the buy cluster, below the sell cluster, in a small
              // dark pill so the user can see what they'd commit to before clicking.
              const dirLabel = dir === 'buy'
                ? `${totalCount} buy${totalCount > 1 ? 's' : ''}`
                : `${totalCount} sell${totalCount > 1 ? 's' : ''}`
              const tickerHint = tickers.length === 0
                ? ''
                : tickers.length <= 3
                  ? ' · ' + tickers.map((t) => `$${t}`).join(' ')
                  : ` · $${tickers[0]} +${tickers.length - 1} more`
              const hoverLabel = `${dirLabel}${tickerHint}`
              const hoverPad = 6
              const hoverFont = 11
              const hoverW = hoverLabel.length * (hoverFont * 0.6) + hoverPad * 2
              const hoverH = hoverFont + hoverPad
              const hoverX = Math.max(2, Math.min(innerWidth - hoverW - 2, avgCx - hoverW / 2))
              const hoverY = dir === 'buy'
                ? anchorY - clusterMaxH - hoverH - 4
                : anchorY + clusterMaxH + 4
              els.push(
                <g key={`hit-${clusterKey}`}>
                  <rect
                    className="timeline-decision-marker"
                    x={xStart} y={yStart}
                    width={xEnd - xStart} height={ySize}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => {
                      // Stop the TimelinePage wrapper's onMouseDown from firing
                      // and starting a range-select drag — on desktop that was
                      // swallowing the click and the overlay never opened.
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (firstId) onSelectAction(firstId)
                      // When the embedder asked us to skip the overlay
                      // (popup uses an always-on benchmark instead), we
                      // still propagate the selection but don't fetch.
                      if (disableMarkerClick) return
                      // Cluster (count > 1) AND embedder wired up zoom →
                      // zoom in to spread the cluster's markers apart, so
                      // the user can tap them individually after one more
                      // click. Singleton clusters keep the existing
                      // overlay-fetch behaviour (no zoom needed).
                      if (group.length > 1 && onClusterZoom) {
                        // Translate cluster-member markers back to indexes
                        // in the data array. Pad by max(2, 30%) on each
                        // side so the cluster doesn't sit at the very edge
                        // after the zoom.
                        const idxs = group.map((m) => data.indexOf(m.point)).filter((i) => i >= 0)
                        if (idxs.length > 0) {
                          const minI = Math.min(...idxs)
                          const maxI = Math.max(...idxs)
                          const span = maxI - minI
                          const pad = Math.max(2, Math.round(span * 0.3))
                          onClusterZoom(
                            Math.max(0, minI - pad),
                            Math.min(data.length - 1, maxI + pad),
                          )
                        }
                        return
                      }
                      if (isActive) { setActiveArrow(null); setTickerLines([]) }
                      else setActiveArrow({ point: repMarker.point, direction: dir, ticker: tickers.join(', '), tickers, count: totalCount, cx: avgCx, cy: anchorY, key: clusterKey })
                    }}
                    onMouseEnter={() => setHoveredKey(clusterKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                  {isHovered && hoverLabel && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={hoverX} y={hoverY}
                        width={hoverW} height={hoverH}
                        rx={3}
                        fill="rgba(15, 23, 42, 0.92)"
                      />
                      <text
                        x={hoverX + hoverW / 2}
                        y={hoverY + hoverH / 2}
                        fill="#fff"
                        fontSize={hoverFont}
                        fontWeight={600}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ userSelect: 'none' }}
                      >
                        {hoverLabel}
                      </text>
                    </g>
                  )}
                </g>
              )
            }
            buyGroups.forEach((group, gi) => addHitRect(group, 'buy', gi))
            sellGroups.forEach((group, gi) => addHitRect(group, 'sell', gi))

            // ── Other-type decisions (pass / research / hold / watchlist / speculate)
            // Lifted OFF the price line into a thin band at the top of the
            // plot area so they don't fight buy/sell cones for attention or
            // tap targets. A dotted vertical line drops from each diamond
            // down to a tiny dot on the price line at the actual date —
            // this is the "decoration, not data" channel.
            const OTHER_BAND_Y = 6   // diamond centres sit just below the top edge
            const OTHER_R = 6
            data.forEach((pt, pi) => {
              const others = (pt.decisions ?? []).filter((d) => d.type === 'other')
              if (others.length === 0) return
              const cx = dateScale(new Date(pt.date))
              const cyOnLine = priceScale(pt.price)
              const first = others[0].action
              const color = getDecisionTypeColor(first.type)
              const isGreyed = selectedTicker != null && !others.some((d) => (d.action.ticker ?? '').toUpperCase() === selectedTicker)
              const fill = isGreyed ? ARROW_GREYED : color
              els.push(
                <g key={`other-${pi}`}
                  onClick={(e) => { e.stopPropagation(); onSelectAction(first.id) }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {others.map((o) => `${getDecisionTypeConfig(o.action.type).label} · ${o.action.ticker}`).join('\n')}
                  </title>
                  {/* Dotted connector — band → price line */}
                  <line x1={cx} y1={OTHER_BAND_Y + OTHER_R} x2={cx} y2={cyOnLine}
                    stroke={fill} strokeWidth={1} strokeDasharray="2 3"
                    opacity={isGreyed ? 0.3 : 0.55} />
                  {/* Tiny intersection dot on the price line */}
                  <circle cx={cx} cy={cyOnLine} r={2}
                    fill={fill} opacity={isGreyed ? 0.35 : 0.85}
                    stroke="#fff" strokeWidth={0.75} />
                  {/* Diamond marker in the top band */}
                  <rect x={cx - OTHER_R} y={OTHER_BAND_Y - OTHER_R}
                    width={OTHER_R * 2} height={OTHER_R * 2}
                    transform={`rotate(45 ${cx} ${OTHER_BAND_Y})`}
                    fill={fill} fillOpacity={isGreyed ? 0.35 : 0.95}
                    stroke="rgba(255,255,255,0.9)" strokeWidth={1.25} />
                  {others.length > 1 && (
                    <text x={cx} y={OTHER_BAND_Y + 0.5} textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fontWeight={800} fill="#fff"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {others.length}
                    </text>
                  )}
                </g>
              )
            })

            return els
          })()}
        </Group>

        {/* Axes */}
        {/* X-axis sits at the bottom of the plot area. When the brush is
            rendered below the plot, the axis sits just above it
            (height - bottomMargin - BRUSH_HEIGHT). When the brush is
            hidden (TimelinePage), the axis sits at the plot bottom
            (height - bottomMargin). Previously this always subtracted
            BRUSH_HEIGHT, leaving the plot area — and any chart line —
            extending 40 px below the axis into the bottom margin, which
            looked like "the chart going below the y-axis labels". */}
        <AxisBottom
          top={height - responsiveMargin.bottom - (showBrush ? BRUSH_HEIGHT : 0)}
          left={responsiveMargin.left}
          scale={dateScale}
          stroke={AXIS_COLOR} tickStroke={AXIS_COLOR}
          tickLabelProps={() => ({ fill: '#334155', fontSize: axisLabelFontSize, textAnchor: 'middle' })}
          numTicks={numBottomTicks}
          tickFormat={(v) => {
            const date = v instanceof Date ? v : new Date(Number(v))
            if (isMobile) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
          }}
        />
        {/* top=responsiveMargin.top is required so that tick labels line
            up with the price gridlines and chart paths — which are all
            drawn inside the main <Group top={responsiveMargin.top}>.
            Without it, the axis sits 24 px above the plot, and every
            chart line visually appears 24 px below its own label. */}
        <AxisLeft
          top={responsiveMargin.top}
          left={responsiveMargin.left} scale={priceScale}
          stroke={AXIS_COLOR} tickStroke={AXIS_COLOR}
          tickLabelProps={() => ({ fill: '#334155', fontSize: leftAxisLabelFontSize, textAnchor: 'end', dx: -4 })}
          numTicks={5}
          tickFormat={(v) => (typeof v === 'number' ? v.toFixed(0) : String(v))}
        />
        {/* Right Y axis: % growth relative to the first visible price. Same
            5 ticks as the left axis, converted into a percentage so the user
            can read "+12.5%" directly instead of mental-mathing the price. */}
        <AxisRight
          top={responsiveMargin.top}
          left={width - responsiveMargin.right}
          scale={priceScale}
          stroke={AXIS_COLOR}
          tickStroke={AXIS_COLOR}
          tickLabelProps={() => ({ fill: '#334155', fontSize: leftAxisLabelFontSize, textAnchor: 'start', dx: 4 })}
          numTicks={5}
          tickFormat={(v) => {
            const firstPrice = data.length > 0 ? data[0].price : 0
            if (!firstPrice || typeof v !== 'number') return ''
            const pct = ((v - firstPrice) / firstPrice) * 100
            const sign = pct >= 0 ? '+' : ''
            return `${sign}${pct.toFixed(0)}%`
          }}
        />

        {/* Brush — hidden when `showBrush={false}` (popup / per-ticker
            page have their own range controls and don't need this rail). */}
        {showBrush && (
          <Group left={responsiveMargin.left} top={height - responsiveMargin.bottom - BRUSH_HEIGHT}>
            <path d={brushLinePath} fill="none" stroke={CHART_LINE_COLOR}
              strokeWidth={1} opacity={0.5} strokeLinejoin="round" strokeLinecap="round" />
            <Brush
              xScale={brushDateScale} yScale={brushPriceScale}
              width={innerWidth} height={BRUSH_HEIGHT}
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
              handleSize={8} onChange={handleBrushChange} onClick={() => {}}
              selectedBoxStyle={{ fill: 'rgba(59, 130, 246, 0.3)', stroke: '#3b82f6' }}
              useWindowMoveEvents
            />
          </Group>
        )}
      </svg>

      {/* Full-chart loading veil — instant feedback when an overlay is being
          fetched. Covers the chart with a subtle translucent layer plus a
          spinner so the user knows something's happening right after the
          click, even if the tooltip hasn't finalized yet. */}
      {fetchingOverlay && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255, 255, 255, 0.45)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              bgcolor: 'rgba(15, 23, 42, 0.82)',
              color: '#fff',
              borderRadius: 1,
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <CircularProgress size={14} sx={{ color: '#fff' }} />
            Loading overlay…
          </Box>
        </Box>
      )}

      {/* Tooltip — shown when an arrow is clicked. Rendered inside the
          chart wrapper by default, positioned near the click. The embedder
          can opt into rendering its own banner outside the chart by passing
          `onDecisionOverlayChange`; in that case this in-plot Paper is
          suppressed so we don't double-render. */}
      {activeArrow && !onDecisionOverlayChange && (
        <Box
          sx={{
            position: 'absolute',
            left: tooltipPos.left,
            top: tooltipPos.top,
            width: TOOLTIP_W,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: '8px 12px',
              borderColor: activeArrow.direction === 'buy' ? ARROW_BUY_COLOR : ARROW_SELL_COLOR,
              borderWidth: 1.5,
            }}
          >
            <Typography variant="body2" fontWeight={700}
              sx={{ color: activeArrow.direction === 'buy' ? ARROW_BUY_COLOR : ARROW_SELL_COLOR, mb: 0.25 }}>
              {activeArrow.direction === 'buy' ? '▲ Buy' : '▼ Sell'} · {activeArrow.count} decision{activeArrow.count !== 1 ? 's' : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              {activeArrow.point.date} · {symbol} ${typeof activeArrow.point.price === 'number' ? activeArrow.point.price.toFixed(2) : '—'}
            </Typography>

            {/* Ticker color legend */}
            {fetchingOverlay ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <CircularProgress size={12} />
                <Typography variant="caption" color="text.secondary">Loading charts…</Typography>
              </Box>
            ) : tickerLines.length > 0 ? (
              <Box sx={{ mt: 0.5 }}>
                {tickerLines.map((tl) => {
                  const sign = tl.pctChange >= 0 ? '+' : ''
                  return (
                    <Box key={tl.ticker} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Box sx={{ width: 16, height: 2.5, bgcolor: tl.color, borderRadius: 1, flexShrink: 0 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ color: tl.color, mr: 'auto' }}>
                        ${tl.ticker}
                      </Typography>
                      <Typography variant="caption" fontWeight={800}
                        sx={{ color: tl.pctChange >= 0 ? ARROW_BUY_COLOR : ARROW_SELL_COLOR }}>
                        {sign}{tl.pctChange.toFixed(1)}%
                      </Typography>
                    </Box>
                  )
                })}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', fontSize: '0.65rem' }}>
                  Since this decision date
                </Typography>
              </Box>
            ) : activeArrow.tickers.length > 0 ? (
              <Box sx={{ mt: 0.5 }}>
                {activeArrow.tickers.map((t, i) => (
                  <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Box sx={{ width: 20, height: 2.5, bgcolor: TICKER_COLORS[i % TICKER_COLORS.length], borderRadius: 1, flexShrink: 0 }} />
                    <Typography variant="caption" fontWeight={700} sx={{ color: TICKER_COLORS[i % TICKER_COLORS.length] }}>
                      ${t}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : null}
          </Paper>
        </Box>
      )}
    </Box>
  )
}

export default memo(TimelineChartVisx)
