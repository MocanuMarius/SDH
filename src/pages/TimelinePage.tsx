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
  IconButton,
  InputLabel,
  Select,
  MenuItem,
  ListItemText,
  Checkbox,
  Link,
  TextField,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import TuneIcon from '@mui/icons-material/Tune'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { tokens } from '../theme'
import { ParentSize } from '@visx/responsive'
import TimelineChartVisx, { getTimelineChartResponsiveMargin, type DecisionOverlayInfo } from '../components/TimelineChartVisx'
import RangeSelectorButtons from '../components/charts/RangeSelectorButtons'
import ChartHoverOverlays from '../components/charts/ChartHoverOverlays'
import { fetchChartData, type ChartRange } from '../services/chartApiService'
import { useEncodedUrlState } from '../hooks/useEncodedUrlState'
import { encodeUrlState, decodeUrlState } from '../utils/urlState'
import type { ActionWithEntry } from '../services/actionsService'
import { useActions } from '../hooks/queries'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from '../components/OptionTypeChip'
import { computeRangeStats, type RangeStats } from '../utils/chartRangeStats'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { getChartCategory, getDecisionTypeColor } from '../theme/decisionTypes'
import { isAutomatedEntry } from '../utils/entryTitle'
import { relativeBucket, formatDayHeader } from '../utils/relativeBucket'

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

// Range presets + matching button row now live in `charts/RangeSelectorButtons`
// so the per-ticker page renders the same set without us re-defining it.

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
  // Deep-link state — one single `?s=<base64>` param carries every
  // user-visible knob on the page so a shared URL restores the view
  // byte-for-byte. The old `?symbol=`, `?types=`, `?hideAutomated=`
  // query params have been folded into this blob; a one-shot
  // migration useEffect further down strips them from the URL when
  // the page mounts with any of them present, so bookmarks from the
  // old scheme keep working but self-upgrade on first load.
  // Ephemeral things (measureSelection drag, hover) stay local state
  // since they're not useful across sessions.
  type TimelineUrlState = {
    range: ChartRange
    zoom: [number, number] | null
    sel: string | null
    /** Benchmark / ticker on display. */
    sym: string
    /** Enabled decision types; array form so the default (all three)
     *  round-trips cleanly and the URL collapses when nothing's filtered. */
    types: ('buy' | 'sell' | 'other')[]
    /** True = broker-import rows hidden from the chart + list. */
    noauto: boolean
  }
  const [urlState, setUrlState] = useEncodedUrlState<TimelineUrlState>('s', {
    range: '6m',
    zoom: null,
    sel: null,
    sym: 'SPY',
    types: ['buy', 'sell', 'other'],
    noauto: true,
  })
  const range = urlState.range
  const setRange = useCallback((v: ChartRange) => setUrlState({ range: v }), [setUrlState])
  const symbolParam = urlState.sym

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
  // selectedActionId + zoomRange are backed by the `?s=` blob above.
  // Wrappers keep the existing setter signatures so every call site keeps
  // its shape — no drive-by refactor in this commit.
  const selectedActionId = urlState.sel
  const setSelectedActionId = useCallback(
    (v: string | null) => setUrlState({ sel: v }),
    [setUrlState],
  )
  const zoomRange = useMemo(
    () => (urlState.zoom ? { startIndex: urlState.zoom[0], endIndex: urlState.zoom[1] } : null),
    [urlState.zoom],
  )
  const setZoomRange = useCallback(
    (v: { startIndex: number; endIndex: number } | null) =>
      setUrlState({ zoom: v ? [v.startIndex, v.endIndex] : null }),
    [setUrlState],
  )

  // Decision-click overlay (used to live inside the chart plot, covering
  // it with a floating Paper). Lifted up here so we can render it as a
  // banner over the range-selector bar — same precise footprint, never
  // covers the timeline plot. Null when no marker is active.
  const [decisionOverlay, setDecisionOverlay] = useState<DecisionOverlayInfo | null>(null)

  // Chart-settings modal — Benchmark / Show-decisions / Hide-broker-imports
  // and From/To date inputs used to eat persistent visual room above +
  // inside the chart. Moved behind a gear affordance so only range presets
  // stay visible at rest. Modal opens over the chart.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [measureSelection, setMeasureSelection] = useState<{ startIndex: number; endIndex: number } | null>(null)
  // Desktop-only hover crosshair + price pill. Updated from mousemove
  // when NOT dragging; cleared on mouseleave. Null = no crosshair shown.
  const [crosshairX, setCrosshairX] = useState<number | null>(null)
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
  // Type filter + broker-import toggle now live entirely in the `?s=`
  // blob. Derived from urlState.types with a memoised lookup object so
  // downstream useMemos that key off `typeFilter` keep their identity
  // stable across renders where the filter hasn't changed.
  const typeFilter = useMemo(() => ({
    buy: urlState.types.includes('buy'),
    sell: urlState.types.includes('sell'),
    other: urlState.types.includes('other'),
  }), [urlState.types])
  const setTypeFilter = useCallback((v: { buy: boolean; sell: boolean; other: boolean }) => {
    const types = (['buy', 'sell', 'other'] as const).filter((t) => v[t])
    setUrlState({ types })
  }, [setUrlState])
  const hideAutomated = urlState.noauto
  const setHideAutomated = useCallback((v: boolean) => setUrlState({ noauto: v }), [setUrlState])

  // ── Legacy URL-param migration ──────────────────────────────────────
  // Old shape used separate `?symbol=`, `?types=`, `?hideAutomated=`
  // query params. New shape folds all of them into the `?s=` blob. On
  // mount: detect any legacy param, fold its value into the `?s=` blob,
  // and strip the legacy keys in a SINGLE setSearchParams call. Doing
  // it in two calls (setUrlState + setSearchParams) was racy — react-
  // router doesn't compose successive `.set(prev => ...)` updater calls
  // within the same tick, so the second call's `prev` still saw the
  // pre-migration URL and clobbered the `?s=` write from the first.
  useEffect(() => {
    const hasLegacy = searchParams.has('symbol') || searchParams.has('types') || searchParams.has('hideAutomated')
    if (!hasLegacy) return
    const patch: Partial<TimelineUrlState> = {}
    const legacySym = searchParams.get('symbol')?.trim()?.toUpperCase()
    if (legacySym) patch.sym = legacySym
    const legacyTypes = searchParams.get('types')
    if (legacyTypes) {
      const valid = (['buy', 'sell', 'other'] as const).filter((t) => legacyTypes.split(',').includes(t))
      patch.types = valid
    }
    const legacyHideAuto = searchParams.get('hideAutomated')
    if (legacyHideAuto != null) patch.noauto = legacyHideAuto !== '0'
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('symbol')
      next.delete('types')
      next.delete('hideAutomated')
      // Merge current `?s=` blob (if any) with the legacy values and
      // re-encode. Keeps unrelated keys the user already set.
      const currentDecoded = decodeUrlState<Partial<TimelineUrlState>>(next.get('s')) ?? {}
      const merged = { ...currentDecoded, ...patch }
      const encoded = encodeUrlState(merged)
      if (encoded) next.set('s', encoded)
      else next.delete('s')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Benchmark changes (e.g. SPY → QQQ) invalidate any saved zoom indices
  // because they refer to a different dataset — clear them when the
  // symbol actually flips. Uses a last-seen-value compare instead of a
  // first-mount flag so React 19 StrictMode's double-invoke-on-mount
  // doesn't spuriously trigger a reset (the flag pattern got defeated
  // because StrictMode re-runs the effect body, then the ref is already
  // true and the guard falls through).
  const lastSymbolRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = lastSymbolRef.current
    lastSymbolRef.current = symbolParam
    if (prev === null || prev === symbolParam) return
    setZoomRange(null)
    setMeasureSelection(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolParam])

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
  }, [mergedChartData, dateToIndex, setZoomRange])

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
    // 18% padding (was 15%) — enough breathing room that even the
    // peak / trough of the visible window sit comfortably inside the
    // plot, and any benchmark/overlay line drawn on the same scale
    // (further expanded by the chart's activeDomain logic) doesn't
    // crash into the y-axis labels.
    const padding = span * 0.18
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
    // Threshold raised 10 → 20 to disambiguate "click" from "measure-drag"
    // on desktop. A genuine click (small tremor) won't accidentally fire
    // a measurement; deliberate drags (≥20 px) still trigger one.
    if (span < 20) return
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
    const el = chartWrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (isDraggingRef.current) {
      selectEndXRef.current = x
      scheduleDragOverlayFrame()
      return
    }
    // Not dragging → update hover crosshair. Rendering is cheap (one
    // state update; React 19 batches), and the block that reads this
    // state is gated on `!dragActive` so drag overlays never fight the
    // crosshair.
    setCrosshairX(x)
  }

  const handleChartMouseUp = () => {
    endRangeDrag()
  }

  const handleChartMouseLeave = () => {
    log('mouseleave (wrapper)', { wasDragging: isDraggingRef.current })
    cancelActiveDrag()
    setSelectedActionId(null)
    setCrosshairX(null)
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
  }, [selectedActionId, actionsInRange, cancelActiveDrag, setSelectedActionId])

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
  }, [setSelectedActionId])

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
      {/* Settings state lives up here so the range-selector area and the
          gear icon share a single open/close flag. Modal content lives
          further down near the chart paper. */}
      {/* Outer filter bar retired — Benchmark / Show-decisions / Broker
          toggle live inside the chart settings modal now (gear icon at
          the bottom-right of the chart Paper). Range presets stay visible
          at rest inside the chart's top control row; they're the only
          primary navigation the user needs at a glance. */}

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

          {/* ── Range-selector bar + decision-click banner ──
              The banner (only visible while a decision cluster is active)
              overlays the range-selector EXACTLY — same rounded-top seam
              with the parent Paper, same bottom divider continuing into
              the chart. It sits in the controls row so it never covers
              the timeline plot below. Dismiss with the ✕ or by clicking
              the chart background. */}
          <Box sx={{ position: 'relative', mb: 1 }}>
          {/* All chart chrome on a single row: range dropdown + Reset
              (when zoomed) + settings gear. The old layout had nine
              preset buttons taking the full row width with the gear on
              the right; on mobile that wrapped onto two lines. The
              dropdown collapses the same nine choices into one 80-px
              control so everything fits at every breakpoint. */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            pb: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            gap: 0.75,
          }}>
            <RangeSelectorButtons
              value={range}
              noActive={zoomRange != null}
              onChange={(v) => {
                setRange(v)
                setZoomRange(null)
                setMeasureSelection(null)
              }}
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
            <Box sx={{ flex: 1 }} />
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              aria-label="Chart settings"
              sx={{ color: 'text.secondary', flexShrink: 0 }}
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Decision banner was lifted out of this position (was
              absolute over the range-selector, too cramped on mobile) —
              see the block rendered below the chart wrapper. This Box
              stays as the relative wrapper for the range-selector so
              the layout structure is unchanged. */}
          </Box>

          <Box
            ref={chartWrapperRef}
            sx={{
              height: { xs: 300, sm: 400, md: 460 },
              position: 'relative',
              // Desktop default is 'crosshair' so mouseover the plot tells
              // the user "this surface is interactive" without lying about
              // grab/pan (which we don't actually do — there is no pan
              // gesture). Decision markers carry their own cursor: pointer
              // override inside the chart SVG so they read as clickable.
              // While a measure-drag is in flight the cursor stays
              // crosshair (no change) and selection is locked off.
              cursor: 'crosshair',
              userSelect: dragActive ? 'none' : 'auto',
              minWidth: 0,
              outline: 'none',
              '&:focus': { outline: 'none' },
              // touchAction: none was needed for pinch-zoom on touch
              // devices but breaks the native scroll-over-the-chart
              // affordance on desktop. Apply only on touch (xs/sm).
              touchAction: { xs: 'none', md: 'auto' },
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
                      showBrush={false}
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
                      onDecisionOverlayChange={setDecisionOverlay}
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
            {/* Shared hover + measure-stats overlays — the crosshair,
                hover-price pill, and committed-measure stats pill all
                live in one component so the Timeline and per-ticker
                pages stay visually identical. Live drag band is still
                rendered imperatively via selectionOverlayRef above for
                perf (avoids re-rendering hundreds of decision markers
                on every mousemove). */}
            {chartSize && (
              <ChartHoverOverlays
                crosshairX={crosshairX}
                dragActive={dragActive}
                wrapperWidth={chartSize.w}
                plotLeft={getPlotMargins().left}
                plotRight={getPlotMargins().right}
                chartData={chartDisplayData}
                measureSelection={measureSelection}
                rangeStats={rangeStats}
              />
            )}
          </Box>

          {/* Decision overlay — moved here below the chart so it gets a
              full-width row to breathe. No mobile concessions: every
              field (direction, count, date, symbol, price, per-ticker
              returns, "since this date") shows at a legible size. The
              rounded Paper + colored border preserve the tooltip
              semantics; a × button dismisses. */}
          {decisionOverlay && (
            <Paper
              variant="outlined"
              sx={{
                mt: 1.25,
                p: { xs: 1, sm: 1.5 },
                borderColor: decisionOverlay.direction === 'buy' ? tokens.markerBuy : tokens.markerSell,
                borderWidth: 1.5,
                borderRadius: 1.5,
                position: 'relative',
              }}
            >
              {/* Dismiss — anchored top-right so the content below isn't
                  fighting for horizontal room with the × button. */}
              <IconButton
                size="small"
                onClick={() => { setSelectedActionId(null); setDecisionOverlay(null) }}
                aria-label="Close decision overlay"
                sx={{ position: 'absolute', top: 4, right: 4, p: 0.5 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>

              {/* Row 1 — headline: direction + count (colored), date,
                  symbol, benchmark price at click. */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, pr: 4 }}>
                <Typography
                  variant="body1"
                  fontWeight={800}
                  sx={{
                    color: decisionOverlay.direction === 'buy' ? tokens.markerBuy : tokens.markerSell,
                    fontSize: { xs: '0.95rem', sm: '1rem' },
                  }}
                >
                  {decisionOverlay.direction === 'buy' ? '▲ Buy' : '▼ Sell'}
                  {' · '}
                  {decisionOverlay.count} decision{decisionOverlay.count !== 1 ? 's' : ''}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                  {decisionOverlay.date} · {decisionOverlay.symbol}
                  {Number.isFinite(decisionOverlay.price) ? ` $${decisionOverlay.price.toFixed(2)}` : ''}
                </Typography>
              </Box>

              {/* Row 2 — per-ticker returns. Grid so on a wide viewport
                  we get multiple per row, on narrow each takes its own
                  line. */}
              {decisionOverlay.fetching ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                  <CircularProgress size={14} />
                  <Typography variant="body2" color="text.secondary">
                    Loading ticker charts…
                  </Typography>
                </Box>
              ) : decisionOverlay.lines.length > 0 ? (
                <Box sx={{ mt: 0.75 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(120px, 1fr))', sm: 'repeat(auto-fill, minmax(140px, 1fr))' },
                      gap: { xs: 0.5, sm: 0.75 },
                    }}
                  >
                    {decisionOverlay.lines.map((tl) => {
                      const sign = tl.pctChange >= 0 ? '+' : ''
                      return (
                        <Box key={tl.ticker} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
                          <Box sx={{ width: 14, height: 2.5, bgcolor: tl.color, borderRadius: 1, flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={700} sx={{ color: tl.color }}>
                            ${tl.ticker}
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight={800}
                            sx={{ color: tl.pctChange >= 0 ? tokens.markerBuy : tokens.markerSell, ml: 'auto' }}
                          >
                            {sign}{tl.pctChange.toFixed(1)}%
                          </Typography>
                        </Box>
                      )
                    })}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.72rem' }}>
                    % change from {decisionOverlay.date} to today
                  </Typography>
                </Box>
              ) : decisionOverlay.tickers.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                  {decisionOverlay.tickers.map((t) => (
                    <Chip key={t} size="small" label={`$${t}`} />
                  ))}
                </Box>
              ) : null}
            </Paper>
          )}

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

      {/* Chart settings modal — holds everything that used to eat a
          persistent row above the chart. Opens from the gear in the
          range-selector. Controls are unchanged functionally; just
          re-homed so the visible chrome stays tight at rest. */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Chart settings</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <FormControl size="small" variant="outlined" fullWidth>
            <InputLabel>Benchmark</InputLabel>
            <Select
              value={benchmarkSymbols.includes(symbolParam?.toUpperCase() ?? '') ? symbolParam : ''}
              label="Benchmark"
              onChange={(e) => setUrlState({ sym: e.target.value })}
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

          <FormControl size="small" variant="outlined" fullWidth>
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>Broker imports</Typography>
            <Chip
              size="small"
              label={hideAutomated ? 'Hidden' : 'Shown'}
              onClick={() => setHideAutomated(!hideAutomated)}
              variant={hideAutomated ? 'filled' : 'outlined'}
              color={hideAutomated ? 'primary' : 'default'}
              sx={{ height: 28, fontSize: '0.75rem', borderRadius: 1, fontWeight: 600 }}
            />
          </Box>

          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Custom date range
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                sx={{ flex: 1 }}
              />
              <Typography variant="body2" color="text.secondary">–</Typography>
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
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} variant="contained" size="small" sx={{ textTransform: 'none' }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DecisionsInRange — a newspaper-style "what happened on each day" list under
// the chart. Replaces a flat dense list with date-section grouping so the
// user can scan by day. Each row is a decision: type chip, ticker, optional
// price, and a 1-line reason snippet. Clicking a row selects it on the chart.
//
// `relativeBucket` + `formatDayHeader` used to live inline here; both got
// lifted to `utils/relativeBucket` so the per-ticker page can re-use the
// exact same labels.
// ─────────────────────────────────────────────────────────────────────────────

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
    <Box sx={{ mt: 0.75 }}>
      <Typography
        variant="overline"
        sx={{ display: 'block', mb: 0.25, color: 'text.secondary', letterSpacing: '0.15em', fontWeight: 700 }}
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
              {/* Primary — coarse relative bucket ("Today" / "3 days ago" /
                  "Over a month ago") so the eye can scan age first. */}
              <Typography
                component="span"
                sx={{
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              >
                {relativeBucket(date)}
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {items.length} {items.length === 1 ? 'decision' : 'decisions'}
              </Typography>
              {/* Secondary — exact date, tiny, pushed right. */}
              <Typography
                component="span"
                variant="caption"
                sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 'auto' }}
              >
                {formatDayHeader(date)}
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
