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

const CHART_LINE_COLOR = '#334155'
const AXIS_COLOR = '#64748b'
const GRID_COLOR = '#cbd5e1'
const ARROW_BUY_COLOR = '#16a34a'
const ARROW_SELL_COLOR = '#dc2626'
const ARROW_GREYED = '#94a3b8'

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

// Marker geometry — dots on the price line + light-cone glows radiating from
// them (up for buys, down for sells). Cone height scales with trade size.
// A 'medium' cone at desktop is 32px; tiny is barely visible, xl is 2x medium.
// We rely on natural alpha compositing + `mix-blend-mode: multiply` (in the
// cone group) for the constructive-interference effect: overlapping greens
// darken into a more saturated green, which reads as "more activity" on a
// light background.
interface MarkerGeom {
  DOT_R: number
  DOT_STROKE: number
  /** Maximum cone footprint — used for clustering & hit-testing. */
  CONE_HEIGHT_MAX: number
  CONE_HALFWIDTH_MAX: number
  /** Per-size cone height in px. Half-width = height * 0.5. */
  CONE_SIZE: Record<import('../types/database').ActionSize, number>
}

function getMarkerGeom(width: number): MarkerGeom {
  const mobile = width < 480
  // Heights tuned so medium is "about what you had before" but a bit longer.
  const sizes = mobile
    ? { tiny: 10, small: 18, medium: 28, large: 42, xl: 60 }
    : { tiny: 12, small: 22, medium: 34, large: 52, xl: 72 }
  const maxH = sizes.xl
  return {
    DOT_R: mobile ? 3.5 : 4,
    DOT_STROKE: 1,
    CONE_HEIGHT_MAX: maxH,
    CONE_HALFWIDTH_MAX: Math.round(maxH * 0.5),
    CONE_SIZE: sizes,
  }
}

function _getDecisionCountsByType(decisions: Array<{ type: string }> | undefined) {
  const counts = { buy: 0, sell: 0, other: 0 }
  if (!decisions?.length) return counts
  for (const d of decisions) {
    if (d.type === 'buy') counts.buy++
    else if (d.type === 'sell') counts.sell++
    else counts.other++
  }
  return counts
}

/** Triangle path for a light-cone glow. Apex at (cx, cy), base at (cy + dir*h)
 * where dir = -1 for buy (cone goes up) and +1 for sell (cone goes down). */
function conePath(cx: number, cy: number, halfW: number, h: number, dir: -1 | 1): string {
  const baseY = cy + dir * h
  return `M ${cx} ${cy} L ${cx + halfW} ${baseY} L ${cx - halfW} ${baseY} Z`
}

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
  selectedActionId: _selectedActionId,
  selectedTicker,
  onSelectAction,
  onChartClick,
  onMouseLeave,
  onBrushChange,
}: TimelineChartVisxProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)   // hover highlight only
  const [activeArrow, setActiveArrow] = useState<ArrowInfo | null>(null)  // click → overlay
  const [tickerLines, setTickerLines] = useState<TickerLine[]>([])
  const [fetchingOverlay, setFetchingOverlay] = useState(false)

  const responsiveMargin = getTimelineChartResponsiveMargin(width)
  const innerWidth = Math.max(0, width - responsiveMargin.left - responsiveMargin.right)
  const innerHeight = Math.max(0, height - responsiveMargin.top - responsiveMargin.bottom - BRUSH_HEIGHT)

  const isMobile = width < 600
  const axisLabelFontSize = isMobile ? 10 : 11
  const leftAxisLabelFontSize = isMobile ? 12 : 14
  const numBottomTicks = width > 400 ? 8 : 5
  const markerGeom = useMemo(() => getMarkerGeom(width), [width])
  const { DOT_R, DOT_STROKE, CONE_HEIGHT_MAX, CONE_HALFWIDTH_MAX, CONE_SIZE } = markerGeom
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

  // Expand yDomain to fit overlay ticker lines when active
  const activeDomain = useMemo((): [number, number] => {
    if (tickerLines.length === 0) return yDomain
    const allMapped = tickerLines.flatMap((tl) => tl.points.map((p) => p.mappedPrice))
    if (!allMapped.length) return yDomain
    const minMapped = Math.min(...allMapped)
    const maxMapped = Math.max(...allMapped)
    const pad = (yDomain[1] - yDomain[0]) * 0.08
    return [
      Math.min(yDomain[0], minMapped - pad),
      Math.max(yDomain[1], maxMapped + pad),
    ]
  }, [yDomain, tickerLines])

  const priceScale = useMemo(
    () =>
      scaleLinear({
        domain: activeDomain,
        range: [innerHeight, 0],
        clamp: false,
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
    if (!selectedActionId) return
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
          {/* Buy glow: opaque near the dot (bottom of bbox), transparent at the top. */}
          <linearGradient id={`buy-glow-${chartId}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={ARROW_BUY_COLOR} stopOpacity="0.85" />
            <stop offset="0.35" stopColor={ARROW_BUY_COLOR} stopOpacity="0.55" />
            <stop offset="1" stopColor={ARROW_BUY_COLOR} stopOpacity="0" />
          </linearGradient>
          {/* Sell glow: opaque at the top (dot position), transparent at the bottom. */}
          <linearGradient id={`sell-glow-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ARROW_SELL_COLOR} stopOpacity="0.85" />
            <stop offset="0.35" stopColor={ARROW_SELL_COLOR} stopOpacity="0.55" />
            <stop offset="1" stopColor={ARROW_SELL_COLOR} stopOpacity="0" />
          </linearGradient>
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

          {/* Ticker overlay lines — rendered on hover */}
          {tickerLines.map((tl) => {
            if (tl.points.length < 2) return null
            const d = tl.points.map((p, i) => {
              const x = dateScale(new Date(p.date))
              const y = priceScale(p.mappedPrice)
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ')
            return (
              <path key={tl.ticker} d={d} fill="none"
                stroke={tl.color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round"
                opacity={0.85}
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

          {/* Ticker end labels + solid % badge */}
          {tickerLines.map((tl) => {
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
            // Dark solid color: darken by mixing with black
            const bgColor = pct >= 0 ? '#14532d' : '#7f1d1d'
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
            const MIN_GAP = CONE_HALFWIDTH_MAX * 2 + 8  // cluster cones whose glows overlap

            interface Marker {
              cx: number; priceY: number; point: TimelineChartPoint
              buyCount: number; sellCount: number
              buyFirstId: string | null; sellFirstId: string | null
              buyTickers: string[]; sellTickers: string[]
              /** Largest size among buys on this marker — drives cone height. */
              buyMaxSize: import('../types/database').ActionSize
              sellMaxSize: import('../types/database').ActionSize
            }
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
              }]
            })

            function clusterDir(dir: 'buy' | 'sell') {
              const relevant = markers.filter((m) => (dir === 'buy' ? m.buyCount : m.sellCount) > 0)
              if (!relevant.length) return []
              const sorted = [...relevant].sort((a, b) => a.cx - b.cx)
              const groups: Marker[][] = []
              let cur = [sorted[0]]
              for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].cx - cur[cur.length - 1].cx < MIN_GAP) cur.push(sorted[i])
                else { groups.push(cur); cur = [sorted[i]] }
              }
              groups.push(cur)
              return groups
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
                      d={conePath(m.cx, m.priceY, hw, h, -1)}
                      fill={greyed ? ARROW_GREYED : `url(#buy-glow-${chartId})`}
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
                      d={conePath(m.cx, m.priceY, hw, h, 1)}
                      fill={greyed ? ARROW_GREYED : `url(#sell-glow-${chartId})`}
                      opacity={op}
                    />
                  )
                })}
              </g>
            )

            // 2. Dots on the line. Three cases:
            //    - buy only → green dot
            //    - sell only → red dot
            //    - both on same marker → SINGLE split dot (green top, red
            //      bottom) so they don't stack and fight for clicks.
            const anyHoverOrActiveDotInGroup = (group: Marker[], dir: 'buy' | 'sell') => {
              const key = dir === 'buy' ? `buy-${buyGroups.indexOf(group)}` : `sell-${sellGroups.indexOf(group)}`
              return hoveredKey === key || activeArrow?.key === key
            }
            const hoveredBuyMarkers = new Set<Marker>()
            const hoveredSellMarkers = new Set<Marker>()
            buyGroups.forEach((g) => { if (anyHoverOrActiveDotInGroup(g, 'buy')) g.forEach((m) => hoveredBuyMarkers.add(m)) })
            sellGroups.forEach((g) => { if (anyHoverOrActiveDotInGroup(g, 'sell')) g.forEach((m) => hoveredSellMarkers.add(m)) })

            const mixedMarkers = markers.filter((m) => m.buyCount > 0 && m.sellCount > 0)
            const mixedSet = new Set(mixedMarkers)

            // Solid green for buy-only
            buyMarkers.filter((m) => !mixedSet.has(m)).forEach((m) => {
              const greyed = isBuyMarkerGreyed(m)
              const fill = greyed ? ARROW_GREYED : ARROW_BUY_COLOR
              const hovered = hoveredBuyMarkers.has(m)
              const r = hovered ? DOT_R + 1.5 : DOT_R
              els.push(
                <circle key={`dot-buy-${m.cx}-${m.priceY}`}
                  cx={m.cx} cy={m.priceY} r={r}
                  fill={fill} stroke="#fff" strokeWidth={DOT_STROKE}
                  style={{ pointerEvents: 'none' }} />
              )
            })
            // Solid red for sell-only
            sellMarkers.filter((m) => !mixedSet.has(m)).forEach((m) => {
              const greyed = isSellMarkerGreyed(m)
              const fill = greyed ? ARROW_GREYED : ARROW_SELL_COLOR
              const hovered = hoveredSellMarkers.has(m)
              const r = hovered ? DOT_R + 1.5 : DOT_R
              els.push(
                <circle key={`dot-sell-${m.cx}-${m.priceY}`}
                  cx={m.cx} cy={m.priceY} r={r}
                  fill={fill} stroke="#fff" strokeWidth={DOT_STROKE}
                  style={{ pointerEvents: 'none' }} />
              )
            })
            // Split dot for mixed: top semicircle = green, bottom = red.
            mixedMarkers.forEach((m) => {
              const greyedBuy = isBuyMarkerGreyed(m)
              const greyedSell = isSellMarkerGreyed(m)
              const topFill = greyedBuy ? ARROW_GREYED : ARROW_BUY_COLOR
              const botFill = greyedSell ? ARROW_GREYED : ARROW_SELL_COLOR
              const hovered = hoveredBuyMarkers.has(m) || hoveredSellMarkers.has(m)
              const r = hovered ? DOT_R + 1.5 : DOT_R
              els.push(
                <g key={`dot-mixed-${m.cx}-${m.priceY}`} style={{ pointerEvents: 'none' }}>
                  {/* Top half (green) — apex up */}
                  <path d={`M ${m.cx - r} ${m.priceY} A ${r} ${r} 0 0 1 ${m.cx + r} ${m.priceY} Z`} fill={topFill} />
                  {/* Bottom half (red) — apex down */}
                  <path d={`M ${m.cx - r} ${m.priceY} A ${r} ${r} 0 0 0 ${m.cx + r} ${m.priceY} Z`} fill={botFill} />
                  {/* Outer white stroke */}
                  <circle cx={m.cx} cy={m.priceY} r={r} fill="none" stroke="#fff" strokeWidth={DOT_STROKE} />
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
              els.push(
                <rect
                  key={`hit-${clusterKey}`}
                  x={xStart} y={yStart}
                  width={xEnd - xStart} height={ySize}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (firstId) onSelectAction(firstId)
                    if (isActive) { setActiveArrow(null); setTickerLines([]) }
                    else setActiveArrow({ point: repMarker.point, direction: dir, ticker: tickers.join(', '), tickers, count: totalCount, cx: avgCx, cy: anchorY, key: clusterKey })
                  }}
                  onMouseEnter={() => setHoveredKey(clusterKey)}
                  onMouseLeave={() => setHoveredKey(null)}
                />
              )
            }
            buyGroups.forEach((group, gi) => addHitRect(group, 'buy', gi))
            sellGroups.forEach((group, gi) => addHitRect(group, 'sell', gi))

            // ── Other-type decisions (pass / research / hold / watchlist / speculate)
            // Render a colored diamond on the price line with a thin connector to the
            // axis, so they're discoverable but don't steal focus from buys/sells.
            data.forEach((pt, pi) => {
              const others = (pt.decisions ?? []).filter((d) => d.type === 'other')
              if (others.length === 0) return
              const cx = dateScale(new Date(pt.date))
              const cy = priceScale(pt.price)
              const first = others[0].action
              const color = getDecisionTypeColor(first.type)
              const isGreyed = selectedTicker != null && !others.some((d) => (d.action.ticker ?? '').toUpperCase() === selectedTicker)
              const fill = isGreyed ? ARROW_GREYED : color
              const r = 7
              els.push(
                <g key={`other-${pi}`}
                  onClick={(e) => { e.stopPropagation(); onSelectAction(first.id) }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {others.map((o) => `${getDecisionTypeConfig(o.action.type).label} · ${o.action.ticker}`).join('\n')}
                  </title>
                  <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2}
                    transform={`rotate(45 ${cx} ${cy})`}
                    fill={fill} fillOpacity={isGreyed ? 0.35 : 0.95}
                    stroke="rgba(255,255,255,0.85)" strokeWidth={1.25} />
                  {others.length > 1 && (
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                      fontSize={10} fontWeight={800} fill="#fff"
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
        <AxisBottom
          top={height - responsiveMargin.bottom - BRUSH_HEIGHT}
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
        <AxisLeft
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

        {/* Brush */}
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
      </svg>

      {/* Tooltip — shown when arrow is clicked */}
      {activeArrow && (
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
