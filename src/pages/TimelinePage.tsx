import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, Link as RouterLink } from 'react-router-dom'
import { PageHeader } from '../components/system'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItemText,
  Checkbox,
  Link,
  TextField,
} from '@mui/material'
import { ParentSize } from '@visx/responsive'
import TimelineChartVisx, { getTimelineChartResponsiveMargin } from '../components/TimelineChartVisx'
import { fetchChartData, type ChartRange } from '../services/chartApiService'
import type { ActionWithEntry } from '../services/actionsService'
import { useActions } from '../hooks/queries'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from '../components/OptionTypeChip'
import { computeRangeStats, type RangeStats } from '../utils/chartRangeStats'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { getChartCategory, getDecisionTypeColor } from '../theme/decisionTypes'
import { isAutomatedEntry } from '../utils/entryTitle'

/** Assign each action to the chart point whose date is closest to the action date (no spreading by capacity). */
function getClosestChartPointByDate(
  chartData: { date: string; price: number }[],
  actionDate: string
): { date: string; price: number } {
  if (!chartData.length) return { date: actionDate, price: 0 }
  const actionMs = new Date(actionDate).getTime()
  let best = chartData[0]
  let bestDist = Math.abs(new Date(best.date).getTime() - actionMs)
  for (const p of chartData) {
    const d = Math.abs(new Date(p.date).getTime() - actionMs)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
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

/** Chart point with optional decisions at this (date, price) — used so dots render on the line */
interface ChartPointWithDecisions {
  date: string
  price: number
  decisions?: Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>
}

/** Enriched chart point: one dot per date, all decisions merged. */
interface ChartPointEnriched extends ChartPointWithDecisions {
  _counts?: { buy: number; sell: number; other: number }
  _total?: number
}

/** Fewer points = smoother interaction; line and decision dots are sampled for display */
const MAX_CHART_POINTS = 96
const CHART_RESIZE_DEBOUNCE_MS = 280
const LIVE_STATS_THROTTLE_MS = 120
/** Set true to trace selection in the console (slow in DevTools) */
const TIMELINE_DEBUG_SELECTION = false

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

/** Enrich each chart point with counts for rendering. */
function enrichChartData(data: ChartPointWithDecisions[]): ChartPointEnriched[] {
  return data.map((pt) => {
    const base = { ...pt } as ChartPointEnriched
    if (!pt.decisions?.length) return base
    base._counts = getDecisionCountsByType(pt.decisions)
    base._total = pt.decisions.length
    return base
  })
}

const BENCHMARK_OPTIONS: { symbol: string; label: string }[] = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'VWCE.DE', label: 'All-World (VWCE)' },
]

export default function TimelinePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const symbolParam = searchParams.get('symbol')?.trim()?.toUpperCase() || searchParams.get('symbol') || 'SPY'
  // Default to 6 months — short enough that decisions don't clump too tightly
  // on mobile, long enough to see meaningful trend.
  const [range, setRange] = useState<ChartRange>('6m')
  const [chartData, setChartData] = useState<{ date: string; price: number }[]>([])
  const [symbol, setSymbol] = useState(symbolParam)
  // Range selector date inputs — synced from zoomRange; user edits trigger applyDateRange
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Actions live in the shared react-query cache. Auto-refreshes when added/edited
  // anywhere else in the app (entry detail, /trades, etc.).
  const actionsQ = useActions({ limit: 500 })
  // Stable reference: `?? []` would mint a fresh array every render and bust
  // every downstream useMemo that depends on `actions`. Wrapping makes the
  // empty-state array reused.
  const actions: ActionWithEntry[] = useMemo(() => actionsQ.data ?? [], [actionsQ.data])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null)
  const [measureSelection, setMeasureSelection] = useState<{ startIndex: number; endIndex: number } | null>(null)
  /** True while range-drag is active — only toggled on start/end (no per-frame updates). */
  const [dragActive, setDragActive] = useState(false)
  const [_liveDragStats, setLiveDragStats] = useState<RangeStats | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)
  const selectionOverlayRef = useRef<HTMLDivElement>(null)
  const selectStartXRef = useRef(0)
  const selectEndXRef = useRef(0)
  const isDraggingRef = useRef(false)
  const rafDragOverlayRef = useRef<number | null>(null)
  const lastLiveStatsMsRef = useRef(0)
  const chartDisplayDataRef = useRef<ChartPointWithDecisions[]>([])
  const justFinishedDragRef = useRef(false)
  // Pinch-to-zoom state (two-finger touch or MacBook trackpad pinch)
  const isPinchingRef = useRef(false)
  const pinchStartDistRef = useRef(0)
  const pinchStartZoomRef = useRef<{ startIndex: number; endIndex: number } | null>(null)
  // Wheel handler ref — always holds current closure, avoids stale values in the non-passive listener
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {})
  const typesParam = searchParams.get('types')
  const [typeFilter, setTypeFilterState] = useState<{ buy: boolean; sell: boolean; other: boolean }>(() => {
    if (!typesParam) return { buy: true, sell: true, other: true }
    const enabled = typesParam.split(',')
    return { buy: enabled.includes('buy'), sell: enabled.includes('sell'), other: enabled.includes('other') }
  })
  const setTypeFilter = (v: { buy: boolean; sell: boolean; other: boolean }) => {
    setTypeFilterState(v)
    const next = new URLSearchParams(searchParams)
    const enabled = (['buy', 'sell', 'other'] as const).filter((t) => v[t])
    if (enabled.length === 3) next.delete('types'); else next.set('types', enabled.join(','))
    setSearchParams(next, { replace: true })
  }
  const hideAutomatedParam = searchParams.get('hideAutomated')
  const [hideAutomated, setHideAutomatedState] = useState(hideAutomatedParam !== '0')
  const setHideAutomated = (v: boolean) => {
    setHideAutomatedState(v)
    const next = new URLSearchParams(searchParams)
    if (v) next.delete('hideAutomated'); else next.set('hideAutomated', '0')
    setSearchParams(next, { replace: true })
  }
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = chartWrapperRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = setTimeout(() => {
        resizeTimeoutRef.current = null
        setChartSize({ w: Math.round(width), h: Math.round(height) })
      }, CHART_RESIZE_DEBOUNCE_MS)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
    }
  }, [loading, chartData.length])

  useEffect(() => {
    setZoomRange(null)
    setMeasureSelection(null)
  }, [range, symbolParam])

  // Fetch sentiment bands and news
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const chartSymbol = symbolParam || 'SPY'
    fetchChartData(chartSymbol, range)
      .catch((e) => {
        if (!cancelled) setError(`Could not load chart for "${chartSymbol}". Check the symbol and try again. (${e?.message ?? 'Chart API unavailable'})`)
        return null
      })
      .then((data) => {
        if (cancelled) return
        if (data?.dates?.length) {
          setSymbol(data.symbol || chartSymbol)
          setChartData(
            data.dates.map((d, i) => ({ date: d, price: data.prices[i] ?? 0 })).filter((p) => p.price > 0)
          )
        } else {
          setChartData([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [range, symbolParam])

  const benchmarkSymbols = BENCHMARK_OPTIONS.map((b) => b.symbol.toUpperCase())
  const isIndexView = !symbolParam || benchmarkSymbols.includes(symbolParam.toUpperCase())
  const symbolCompanyKey = isIndexView ? null : normalizeTickerToCompany(symbolParam!)

  const minDate = chartData.length > 0 ? chartData[0].date : ''
  // Include today's actions even if chart data only goes to yesterday's close
  const maxDate = chartData.length > 0 ? new Date().toISOString().slice(0, 10) : ''

  const actionsInRange = useMemo(
    () =>
      symbolCompanyKey
        ? actions.filter(
            (a) =>
              normalizeTickerToCompany(a.ticker) === symbolCompanyKey &&
              a.action_date >= minDate &&
              a.action_date <= maxDate
          )
        : actions.filter((a) => a.action_date >= minDate && a.action_date <= maxDate),
    [actions, symbolCompanyKey, minDate, maxDate]
  )

  const filteredActionsInRange = useMemo(() => {
    return actionsInRange.filter((a) => {
      const t = getChartCategory(a.type)
      return typeFilter[t]
    })
  }, [actionsInRange, typeFilter])

  const chartFilteredActions = useMemo(() => {
    if (!hideAutomated) return filteredActionsInRange
    return filteredActionsInRange.filter((a) => !a.entry || !isAutomatedEntry(a.entry))
  }, [filteredActionsInRange, hideAutomated])

  const downsampledChartData = useMemo(() => {
    if (chartData.length <= MAX_CHART_POINTS) return chartData
    const step = (chartData.length - 1) / (MAX_CHART_POINTS - 1)
    const out: { date: string; price: number }[] = []
    for (let i = 0; i < MAX_CHART_POINTS; i++) {
      const idx = i === MAX_CHART_POINTS - 1 ? chartData.length - 1 : Math.round(i * step)
      out.push(chartData[idx])
    }
    return out
  }, [chartData])

  const mergedChartData = useMemo((): ChartPointWithDecisions[] => {
    const byDate = new Map<string, Array<{ action: ActionWithEntry; type: 'buy' | 'sell' | 'other' }>>()
    for (const a of chartFilteredActions) {
      const closest = getClosestChartPointByDate(downsampledChartData, a.action_date || '')
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
  }, [downsampledChartData, chartFilteredActions])

  const chartDisplayData = useMemo(() => {
    if (zoomRange == null || mergedChartData.length === 0) return mergedChartData
    const { startIndex, endIndex } = zoomRange
    const start = Math.max(0, Math.min(startIndex, mergedChartData.length - 1))
    const end = Math.max(start, Math.min(endIndex, mergedChartData.length - 1))
    return mergedChartData.slice(start, end + 1)
  }, [mergedChartData, zoomRange])

  chartDisplayDataRef.current = chartDisplayData

  // ── Date range helpers ────────────────────────────────────────────────────
  // Convert a YYYY-MM-DD date string to the nearest index in mergedChartData
  const dateToIndex = useCallback((dateStr: string, side: 'start' | 'end'): number => {
    const data = mergedChartData
    if (!data.length || !dateStr) return side === 'start' ? 0 : data.length - 1
    if (side === 'start') {
      const idx = data.findIndex(d => d.date.slice(0, 10) >= dateStr)
      return idx >= 0 ? idx : data.length - 1
    } else {
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].date.slice(0, 10) <= dateStr) return i
      }
      return 0
    }
  }, [mergedChartData])

  const applyDateRange = useCallback((from: string, to: string) => {
    const data = mergedChartData
    if (!data.length) return
    const startIdx = from ? dateToIndex(from, 'start') : 0
    const endIdx   = to   ? dateToIndex(to, 'end')     : data.length - 1
    if (endIdx > startIdx) setZoomRange({ startIndex: startIdx, endIndex: endIdx })
    else if (startIdx === 0 && endIdx === data.length - 1) setZoomRange(null)
  }, [mergedChartData, dateToIndex])

  // Sync zoomRange → date inputs (one-way: external zoom changes update the inputs)
  useEffect(() => {
    const data = mergedChartData
    if (!data.length) return
    if (zoomRange == null) {
      setFromDate(data[0].date.slice(0, 10))
      setToDate(data[data.length - 1].date.slice(0, 10))
    } else {
      const si = Math.max(0, Math.min(zoomRange.startIndex, data.length - 1))
      const ei = Math.max(0, Math.min(zoomRange.endIndex,   data.length - 1))
      setFromDate(data[si].date.slice(0, 10))
      setToDate(data[ei].date.slice(0, 10))
    }
  }, [zoomRange, mergedChartData])

  const chartDisplayDataEnriched = useMemo(
    () => enrichChartData(chartDisplayData),
    [chartDisplayData]
  )

  const yAxisDomain = useMemo(() => {
    if (chartDisplayData.length === 0) return undefined
    const prices = chartDisplayData.map((d) => d.price).filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (prices.length === 0) return undefined
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const span = max - min || 1
    const padding = span * 0.15
    return [min - padding, max + padding] as [number, number]
  }, [chartDisplayData])

  // ── Wheel / trackpad handler (always fresh via ref, registered non-passive) ──
  // MacBook trackpad pinch  = wheel + ctrlKey  → zoom in/out centred on cursor
  // MacBook trackpad scroll = wheel (no ctrlKey) → pan the visible range
  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault()
    if (mergedChartData.length < 2) return

    const totalLen = mergedChartData.length
    const currentStart = zoomRange?.startIndex ?? 0
    const currentEnd   = zoomRange?.endIndex   ?? totalLen - 1
    const currentLen   = Math.max(1, currentEnd - currentStart)

    if (e.ctrlKey) {
      // Pinch gesture: negative deltaY = spread fingers = zoom in (show less range)
      const factor = e.deltaY > 0 ? 1.3 : 0.77
      const newLen = Math.round(Math.max(5, Math.min(totalLen - 1, currentLen * factor)))

      const el = chartWrapperRef.current
      const rect = el?.getBoundingClientRect()
      const margins = getPlotMargins()
      const plotW = Math.max(1, (rect?.width ?? 0) - margins.left - margins.right)
      const cursorRatio = rect
        ? Math.max(0, Math.min(1, (e.clientX - rect.left - margins.left) / plotW))
        : 0.5

      const newStart = Math.max(0, Math.round(currentStart + cursorRatio * currentLen - cursorRatio * newLen))
      const newEnd   = Math.min(totalLen - 1, newStart + newLen)
      if (newEnd - newStart >= 2) setZoomRange({ startIndex: newStart, endIndex: newEnd })
    } else {
      // Two-finger scroll → pan
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const steps = Math.round(currentLen * 0.12 * Math.sign(raw))
      if (steps === 0) return
      const newStart = Math.max(0, Math.min(totalLen - 1 - currentLen, currentStart + steps))
      setZoomRange({ startIndex: newStart, endIndex: newStart + currentLen })
    }
  }

  // Register non-passive wheel listener whenever loading state changes
  // (chart wrapper is only in the DOM after loading=false)
  useEffect(() => {
    const el = chartWrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading]) // re-attach after loading completes and chart wrapper mounts

  const log = (msg: string, data?: object) => {
    if (TIMELINE_DEBUG_SELECTION) console.log('[Timeline selection]', msg, data ?? '')
  }

  const cancelDragRaf = () => {
    if (rafDragOverlayRef.current != null) {
      cancelAnimationFrame(rafDragOverlayRef.current)
      rafDragOverlayRef.current = null
    }
  }

  const hideDragOverlay = () => {
    const o = selectionOverlayRef.current
    if (o) o.style.display = 'none'
  }

  const getPlotMargins = () => {
    const wrap = chartWrapperRef.current
    if (!wrap) return { top: 24, left: 52, right: 24, bottom: 24 }
    return getTimelineChartResponsiveMargin(wrap.getBoundingClientRect().width)
  }

  const endRangeDrag = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setDragActive(false)
    setLiveDragStats(null)
    cancelDragRaf()
    lastLiveStatsMsRef.current = 0
    hideDragOverlay()

    const wrap = chartWrapperRef.current
    if (!wrap) return
    const startX = selectStartXRef.current
    const endX = selectEndXRef.current
    const span = Math.abs(endX - startX)
    if (span < 10) return
    const rect = wrap.getBoundingClientRect()
    const margins = getPlotMargins()
    const plotWidth = rect.width - margins.left - margins.right
    if (plotWidth <= 0) return
    const data = chartDisplayDataRef.current
    const dataLen = data.length
    if (dataLen === 0) return
    const [x1, x2] = startX < endX ? [startX, endX] : [endX, startX]
    const plotX1 = Math.max(0, x1 - margins.left)
    const plotX2 = Math.min(plotWidth, x2 - margins.left)
    const startIndexInDisplay = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
    let endIndexInDisplay = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
    if (endIndexInDisplay <= startIndexInDisplay) endIndexInDisplay = Math.min(startIndexInDisplay + 1, dataLen - 1)
    log('endRangeDrag -> apply measure selection', { startIndexInDisplay, endIndexInDisplay, dataLen })
    setMeasureSelection({ startIndex: startIndexInDisplay, endIndex: endIndexInDisplay })
    justFinishedDragRef.current = true
  }, [])

  const scheduleDragOverlayFrame = useCallback(() => {
    if (rafDragOverlayRef.current != null) return
    rafDragOverlayRef.current = requestAnimationFrame(() => {
      rafDragOverlayRef.current = null
      const o = selectionOverlayRef.current
      const wrap = chartWrapperRef.current
      if (!o || !wrap || !isDraggingRef.current) return
      const start = selectStartXRef.current
      const end = selectEndXRef.current
      const rect = wrap.getBoundingClientRect()
      const margins = getPlotMargins()
      const plotH = Math.max(0, rect.height - margins.top - margins.bottom)
      const left = Math.min(start, end)
      const width = Math.abs(end - start)
      o.style.display = 'block'
      o.style.left = `${left}px`
      o.style.top = `${margins.top}px`
      o.style.width = `${width}px`
      o.style.height = `${plotH}px`

      const now = Date.now()
      if (now - lastLiveStatsMsRef.current < LIVE_STATS_THROTTLE_MS) return
      lastLiveStatsMsRef.current = now
      const plotWidth = rect.width - margins.left - margins.right
      const data = chartDisplayDataRef.current
      if (plotWidth <= 0 || data.length === 0) return
      const dataLen = data.length
      const [x1, x2] = start < end ? [start, end] : [end, start]
      const plotX1 = Math.max(0, x1 - margins.left)
      const plotX2 = Math.min(plotWidth, x2 - margins.left)
      const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * dataLen), dataLen - 1))
      let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * dataLen), dataLen - 1))
      if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, dataLen - 1)
      const stats = computeRangeStats(data, startIndex, endIndex)
      setLiveDragStats(stats)
    })
  }, [])

  const cancelActiveDrag = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setDragActive(false)
    setLiveDragStats(null)
    cancelDragRaf()
    lastLiveStatsMsRef.current = 0
    hideDragOverlay()
  }, [])

  const handleChartMouseDown = (e: React.MouseEvent) => {
    const target = e.target as Element | null
    if (e.button !== 0) {
      log('mousedown ignored (not left button)', { button: e.button })
      return
    }
    if (target?.closest?.('circle') || (target as SVGElement)?.tagName === 'circle') {
      log('mousedown ignored (on circle)')
      return
    }
    if (target?.closest?.('.timeline-decision-marker')) {
      log('mousedown ignored (on decision marker)')
      return
    }
    const el = chartWrapperRef.current
    if (!el) {
      log('mousedown ignored (no wrapper ref)')
      return
    }
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    selectStartXRef.current = x
    selectEndXRef.current = x
    isDraggingRef.current = true
    setDragActive(true)
    lastLiveStatsMsRef.current = 0
    log('mousedown -> start range drag', { x })
    scheduleDragOverlayFrame()
  }

  const handleChartMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const el = chartWrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    selectEndXRef.current = e.clientX - rect.left
    scheduleDragOverlayFrame()
  }

  const handleChartMouseUp = () => {
    endRangeDrag()
  }

  const handleChartMouseLeave = () => {
    log('mouseleave (wrapper)', { wasDragging: isDraggingRef.current })
    cancelActiveDrag()
    setSelectedActionId(null)
  }

  const getXFromTouch = (clientX: number): number => {
    const el = chartWrapperRef.current
    if (!el) return 0
    return clientX - el.getBoundingClientRect().left
  }

  const getTouchDist = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleChartTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      // Two-finger touch → start pinch-to-zoom
      e.preventDefault()
      cancelActiveDrag()
      isPinchingRef.current = true
      pinchStartDistRef.current = getTouchDist(e.touches)
      pinchStartZoomRef.current = zoomRange ?? { startIndex: 0, endIndex: mergedChartData.length - 1 }
      log('touchstart -> start pinch zoom')
      return
    }
    if (isPinchingRef.current) return
    const target = e.target as Element | null
    if (target?.closest?.('circle') || (target as SVGElement)?.tagName === 'circle') {
      log('touchstart ignored (on circle)')
      return
    }
    if (target?.closest?.('.timeline-decision-marker')) {
      log('touchstart ignored (on decision marker)')
      return
    }
    if (e.touches.length === 0) return
    const x = getXFromTouch(e.touches[0].clientX)
    selectStartXRef.current = x
    selectEndXRef.current = x
    isDraggingRef.current = true
    setDragActive(true)
    lastLiveStatsMsRef.current = 0
    log('touchstart -> start range drag', { x })
    scheduleDragOverlayFrame()
  }

  const handleChartTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length >= 2) {
      e.preventDefault()
      const currentDist = getTouchDist(e.touches)
      if (pinchStartDistRef.current === 0) return
      const scale = pinchStartDistRef.current / currentDist // >1 zoom out, <1 zoom in
      const initial = pinchStartZoomRef.current ?? { startIndex: 0, endIndex: mergedChartData.length - 1 }
      const initialLen = Math.max(1, initial.endIndex - initial.startIndex)
      const newLen = Math.round(Math.max(5, Math.min(mergedChartData.length - 1, initialLen * scale)))
      const center = (initial.startIndex + initial.endIndex) / 2
      const newStart = Math.max(0, Math.round(center - newLen / 2))
      const newEnd = Math.min(mergedChartData.length - 1, newStart + newLen)
      setZoomRange({ startIndex: newStart, endIndex: newEnd })
      return
    }
    if (!isDraggingRef.current || e.touches.length === 0) return
    e.preventDefault()
    selectEndXRef.current = getXFromTouch(e.touches[0].clientX)
    scheduleDragOverlayFrame()
  }

  const handleChartTouchEnd = (e: React.TouchEvent) => {
    if (isPinchingRef.current) {
      if (e.touches.length < 2) isPinchingRef.current = false
      return
    }
    endRangeDrag()
  }

  const handleChartTouchCancel = () => {
    log('touchcancel (wrapper)', { wasDragging: isDraggingRef.current })
    isPinchingRef.current = false
    cancelActiveDrag()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedActionId(null)
        cancelActiveDrag()
        return
      }

      // Keyboard navigation for decisions: Arrow Left/Right to navigate between decision points
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const data = chartDisplayDataRef.current
        if (data.length === 0) return

        // Find all points with decisions
        const pointsWithDecisions = data
          .map((pt, idx) => ({
            date: pt.date,
            price: pt.price,
            decisions: pt.decisions ?? [],
            dataIndex: idx,
          }))
          .filter((pt) => pt.decisions.length > 0)

        if (pointsWithDecisions.length === 0) return

        // Find the current selection or default to first
        const currentIdx = pointsWithDecisions.findIndex((pt) =>
          pt.decisions.some((d) => d.action.id === selectedActionId)
        )

        let nextIdx: number
        if (e.key === 'ArrowLeft') {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : pointsWithDecisions.length - 1
        } else {
          nextIdx = currentIdx < pointsWithDecisions.length - 1 ? currentIdx + 1 : 0
        }

        const nextPoint = pointsWithDecisions[nextIdx]
        if (nextPoint?.decisions[0]) {
          e.preventDefault()
          setSelectedActionId(nextPoint.decisions[0].action.id)
        }
        return
      }

      // Enter key: Open selected action detail (navigate to entry page)
      if (e.key === 'Enter' && selectedActionId) {
        const action = actionsInRange.find((a) => a.id === selectedActionId)
        if (action?.entry?.id) {
          e.preventDefault()
          window.location.href = `/entries/${action.entry.id}`
        }
        return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedActionId, actionsInRange, cancelActiveDrag])

  useEffect(() => {
    if (!dragActive) return
    const onGlobalMouseUp = () => {
      log('mouseup (global/window)')
      endRangeDrag()
    }
    window.addEventListener('mouseup', onGlobalMouseUp)
    return () => window.removeEventListener('mouseup', onGlobalMouseUp)
  }, [dragActive, endRangeDrag])

  const selectedAction = selectedActionId ? actionsInRange.find((a) => a.id === selectedActionId) : null

  const rangeStats = useMemo((): RangeStats | null => {
    if (!measureSelection || chartDisplayData.length === 0) return null
    return computeRangeStats(chartDisplayData, measureSelection.startIndex, measureSelection.endIndex)
  }, [measureSelection, chartDisplayData])

  const handleChartBackgroundClick = useCallback(() => {
    log('onChartClick (background click from visx)')
    if (justFinishedDragRef.current) {
      log('onChartClick -> skip (just finished drag)')
      justFinishedDragRef.current = false
      return
    }
    setSelectedActionId(null)
    setMeasureSelection(null)
  }, [])

  return (
    <Box>
      <PageHeader
        title={
          <>
            Timeline
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' · '}
              {/* Resolve the benchmark symbol → friendly label (e.g. "S&P 500"
                  for SPY). When the user is viewing a non-benchmark ticker,
                  fall back to the raw symbol. */}
              {BENCHMARK_OPTIONS.find((b) => b.symbol === symbol.toUpperCase())?.label ?? symbol}
            </Box>
          </>
        }
        dense
      />
      {/* Filter row — every control is 36px tall so the bar reads as one line. */}
      <Box
        sx={{
          mb: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          '& .MuiOutlinedInput-root': { minHeight: 36 },
        }}
      >
        <FormControl size="small" sx={{ minWidth: 140 }} variant="outlined">
          <InputLabel>Benchmark</InputLabel>
          <Select
            value={benchmarkSymbols.includes(symbolParam?.toUpperCase() ?? '') ? symbolParam : ''}
            label="Benchmark"
            onChange={(e) => setSearchParams({ symbol: e.target.value })}
            displayEmpty
            renderValue={(v) => {
              if (!v && symbolParam && !benchmarkSymbols.includes(symbolParam.toUpperCase())) return symbolParam
              const opt = BENCHMARK_OPTIONS.find(b => b.symbol === v)
              return opt?.label ?? v ?? ''
            }}
          >
            {BENCHMARK_OPTIONS.map((b) => (
              <MenuItem key={b.symbol} value={b.symbol}>
                {b.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }} variant="outlined">
          <InputLabel>Show decisions</InputLabel>
          <Select
            multiple
            value={(['buy', 'sell', 'other'] as const).filter((t) => typeFilter[t])}
            label="Show decisions"
            onChange={(e) => {
              const v = e.target.value as string[]
              setTypeFilter({
                buy: v.includes('buy'),
                sell: v.includes('sell'),
                other: v.includes('other'),
              })
            }}
            renderValue={(selected) =>
              selected.length === 3 ? 'All' : selected.map((t) => (t === 'other' ? 'Other' : t)).join(', ')
            }
          >
            <MenuItem value="buy">
              <Checkbox checked={typeFilter.buy} size="small" />
              <ListItemText primary="Buy" sx={{ ml: 0.5 }} />
            </MenuItem>
            <MenuItem value="sell">
              <Checkbox checked={typeFilter.sell} size="small" />
              <ListItemText primary="Sell" sx={{ ml: 0.5 }} />
            </MenuItem>
            <MenuItem value="other">
              <Checkbox checked={typeFilter.other} size="small" />
              <ListItemText primary="Other" sx={{ ml: 0.5 }} />
            </MenuItem>
          </Select>
        </FormControl>
        <Chip
          size="small"
          label={hideAutomated ? 'Hide broker imports' : 'Show broker imports'}
          onClick={() => setHideAutomated(!hideAutomated)}
          variant={hideAutomated ? 'filled' : 'outlined'}
          color={hideAutomated ? 'primary' : 'default'}
          sx={{ height: 36, fontSize: '0.75rem', borderRadius: 1, fontWeight: 600, px: 0.5 }}
        />
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : chartData.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No chart data for <strong>{symbolParam}</strong>. Verify the symbol is correct, or the chart API may be unavailable locally (it runs automatically on Vercel).
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, minWidth: 0, overflow: 'hidden' }}>
          <Box ref={chartContainerRef} sx={{ bgcolor: 'background.paper', minWidth: 0 }}>

          {/* ── Range Selector Bar ── */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
            pb: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexWrap: 'wrap',
            gap: 1,
          }}>
            {/* Preset range buttons */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
              {RANGES.map((r) => (
                <Button
                  key={r.value}
                  size="small"
                  disableElevation
                  variant={range === r.value && zoomRange == null ? 'contained' : 'text'}
                  color="primary"
                  onClick={() => {
                    setRange(r.value)
                    setZoomRange(null)
                    setMeasureSelection(null)
                  }}
                  sx={{
                    minWidth: 28,
                    minHeight: 28,
                    px: 0.5,
                    py: 0.15,
                    fontSize: '0.7rem',
                    fontWeight: range === r.value && zoomRange == null ? 700 : 500,
                    borderRadius: 1,
                    color: range === r.value && zoomRange == null ? undefined : 'text.secondary',
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </Box>

            {/* From / To date inputs */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="From"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const v = e.target.value
                  setFromDate(v)
                  if (v) applyDateRange(v, toDate)
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: 130, sm: 148 } }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mx: 0.25 }}>–</Typography>
              <TextField
                size="small"
                label="To"
                type="date"
                value={toDate}
                onChange={(e) => {
                  const v = e.target.value
                  setToDate(v)
                  if (v) applyDateRange(fromDate, v)
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: 130, sm: 148 } }}
              />
              {zoomRange != null && (
                <Button
                  size="small"
                  onClick={() => { setZoomRange(null); setMeasureSelection(null) }}
                  sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 0, px: 1 }}
                >
                  Reset
                </Button>
              )}
            </Box>
          </Box>

          <Box
            ref={chartWrapperRef}
            sx={{
              height: { xs: 300, sm: 400, md: 460 },
              position: 'relative',
              cursor: dragActive ? 'crosshair' : 'grab',
              userSelect: dragActive ? 'none' : 'auto',
              minWidth: 0,
              outline: 'none',
              '&:focus': { outline: 'none' },
              touchAction: 'none',
            }}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseLeave}
            onTouchStart={handleChartTouchStart}
            onTouchMove={handleChartTouchMove}
            onTouchEnd={handleChartTouchEnd}
            onTouchCancel={handleChartTouchCancel}
            onDoubleClick={() => {
              setMeasureSelection(null)
              setSelectedActionId(null)
            }}
          >
            <Box sx={{ width: '100%', height: '100%', pointerEvents: dragActive ? 'none' : 'auto', outline: 'none' }}>
              <ParentSize
                // React 19 + strict mode trips a race where ParentSize's
                // ResizeObserver misses the initial measurement and freezes
                // at 0x0. Seeding an initialSize + a short debounce lets the
                // chart render immediately at a sensible size while still
                // updating correctly on subsequent resizes.
                initialSize={{ width: 600, height: 400 }}
                debounceTime={40}
              >
                {({ width, height }) =>
                  width > 0 && height > 0 && yAxisDomain ? (
                    <TimelineChartVisx
                      data={chartDisplayDataEnriched}
                      symbol={symbol}
                      yDomain={yAxisDomain}
                      width={width}
                      height={height}
                      selectedActionId={selectedActionId}
                      selectedTicker={selectedAction?.ticker?.toUpperCase() ?? null}
                      onSelectAction={setSelectedActionId}
                      onChartClick={handleChartBackgroundClick}
                      onMouseLeave={handleChartMouseLeave}
                      onBrushChange={(start, end) => setMeasureSelection({ startIndex: start, endIndex: end })}
                      onClusterZoom={(localStart, localEnd) => {
                        // The chart's `data` prop is already the visible
                        // slice (chartDisplayData). Translate the slice-
                        // local indices back to mergedChartData indices
                        // before applying as the new zoom window.
                        const offset = zoomRange?.startIndex ?? 0
                        const globalStart = offset + localStart
                        const globalEnd = offset + localEnd
                        if (globalEnd > globalStart) {
                          setZoomRange({ startIndex: globalStart, endIndex: globalEnd })
                          setMeasureSelection(null)
                        }
                      }}
                    />
                  ) : null
                }
              </ParentSize>
            </Box>
            <Box
              ref={selectionOverlayRef}
              aria-hidden
              sx={{
                display: 'none',
                position: 'absolute',
                pointerEvents: 'none',
                bgcolor: 'rgba(59, 130, 246, 0.1)',
                zIndex: 5,
              }}
            />
            {(() => {
              if (!measureSelection || !rangeStats || !chartSize) return null
              const stats = rangeStats
              const margins = getPlotMargins()
              const tooltipLeft = margins.left + ((measureSelection.startIndex + measureSelection.endIndex) / 2 / Math.max(1, chartDisplayData.length)) * (chartSize.w - margins.left - margins.right)
              const tooltipHalfWidth = 84
              const adjustedLeft = Math.max(tooltipHalfWidth, Math.min(chartSize.w - tooltipHalfWidth, tooltipLeft))
              return (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 10,
                    left: adjustedLeft,
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
                      {stats.cagr != null && (
                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem', ml: 0.5 }}>
                          ({stats.cagr >= 0 ? '+' : ''}{stats.cagr.toFixed(1)}%/yr)
                        </Box>
                      )}
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
          {/* Decisions in range — newspaper-style date sections so the user
              can scan "what happened on each day" instead of an undifferentiated
              flat list. Click a row to highlight that decision on the chart. */}
          {chartFilteredActions.length > 0 && (
            <DecisionsInRange
              actions={chartFilteredActions}
              selectedActionId={selectedActionId}
              onSelect={setSelectedActionId}
            />
          )}
          {/* Decision legend chips — compact, no text */}
          {(chartFilteredActions.length > 0 || actionsInRange.length > 0) && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DecisionChip type="buy" size="small" />
              <DecisionChip type="sell" size="small" />
              <DecisionChip type="other" label="Other" size="small" />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                {chartFilteredActions.length} shown
              </Typography>
            </Box>
          )}
          {selectedAction && (
            <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Selected decision
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Chip
                  size="small"
                  label={selectedAction.type}
                  sx={{
                    bgcolor: getDecisionTypeColor(selectedAction.type),
                    color: '#fff',
                  }}
                />
                <Typography variant="body2">
                  {getTickerDisplayLabel(selectedAction.ticker) || `$${selectedAction.ticker || '?'}`} · <RelativeDate date={selectedAction.action_date} variant="body2" />
                  {selectedAction.price ? ` · $${selectedAction.price}` : ''}
                </Typography>
                {selectedAction.entry?.id && (
                  <Link component={RouterLink} to={`/entries/${selectedAction.entry.id}`} variant="body2" underline="hover">
                    View entry →
                  </Link>
                )}
              </Box>
            </Paper>
          )}
          </Box>
        </Paper>
      )}

    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DecisionsInRange — a newspaper-style "what happened on each day" list under
// the chart. Replaces a flat dense list with date-section grouping so the
// user can scan by day. Each row is a decision: type chip, ticker, optional
// price, and a 1-line reason snippet. Clicking a row selects it on the chart.
// ─────────────────────────────────────────────────────────────────────────────

function formatDayHeader(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  // e.g. "Mon, Apr 14 · '26"
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' })
}

function DecisionsInRange({
  actions,
  selectedActionId,
  onSelect,
}: {
  actions: ActionWithEntry[]
  selectedActionId: string | null
  onSelect: (id: string | null) => void
}) {
  // Group by action_date, newest first. Each group keeps the original
  // sorted-by-id order (decision order within a day is rarely meaningful;
  // alphabetical-by-ticker would be misleading).
  const groups = useMemo(() => {
    const byDate = new Map<string, ActionWithEntry[]>()
    for (const a of actions) {
      const key = (a.action_date || '').slice(0, 10) || 'unknown'
      const arr = byDate.get(key) ?? []
      arr.push(a)
      byDate.set(key, arr)
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }))
  }, [actions])

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        variant="overline"
        sx={{ display: 'block', mb: 0.5, color: 'text.secondary', letterSpacing: '0.15em', fontWeight: 700 }}
      >
        Decisions in range · {actions.length}
      </Typography>
      <Box
        sx={{
          maxHeight: 320,
          overflow: 'auto',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {groups.map(({ date, items }) => (
          <Box key={date}>
            {/* Date subhead — newspaper section opener: serif, light bg, sticky
                while the user scrolls the list so they always see what day
                they're looking at. */}
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'divider',
                px: 1,
                py: 0.5,
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                {formatDayHeader(date)}
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary">
                {items.length} {items.length === 1 ? 'decision' : 'decisions'}
              </Typography>
            </Box>
            {items.map((a) => (
              <Box
                key={a.id}
                onClick={() => onSelect(a.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(a.id)
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderBottom: 1,
                  borderColor: 'divider',
                  cursor: 'pointer',
                  bgcolor: selectedActionId === a.id ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                  // Tighten on mobile so more rows fit before scrolling.
                  flexWrap: { xs: 'wrap', sm: 'nowrap' },
                }}
              >
                <DecisionChip type={a.type} size="small" />
                <Typography
                  component="span"
                  sx={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    minWidth: 0,
                  }}
                  noWrap
                >
                  {getTickerDisplayLabel(a.ticker) || (a.ticker ? `$${a.ticker}` : '—')}
                </Typography>
                <OptionTypeChip ticker={a.ticker} />
                {a.price && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}
                  >
                    ${a.price}
                  </Typography>
                )}
                {/* Reason snippet — single line, fades out at the right edge. */}
                {a.reason && (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.reason}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
