import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Tooltip as MuiTooltip,
} from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import Grid from '@mui/material/Grid2'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { listEntries } from '../services/entriesService'
import { listActions } from '../services/actionsService'
import { listOutcomes, getTickerForOutcome } from '../services/outcomesService'
import { listPassed } from '../services/passedService'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import { normalizeTicker } from '../utils/tickerNormalization'
import { fetchChartData } from '../services/chartApiService'
import { stripMarkdown } from '../utils/text'
import { isAutomatedEntry } from '../utils/entryTitle'
import { ERROR_TYPE_LABELS } from '../utils/errorTypeLabels'
import { computeCounterfactualFromChart, computeCagrFromChart, formatCagrPercent, formatDurationSince } from '../utils/cagr'
import type { Entry } from '../types/database'
import type { Action } from '../types/database'
import type { Outcome, ErrorType, Passed } from '../types/database'
import DecisionChip from '../components/DecisionChip'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PASSED_HYPOTHETICAL_AMOUNT = 10_000 // $10k per pass for opportunity-cost math

function parsePrice(price: string | null | undefined): number | null {
  if (price == null || typeof price !== 'string') return null
  const n = Number(price.replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

// Explicit hex so Recharts SVG picks up theme colors (CSS vars often resolve to black in SVG)
const CHART_COLOR_PRIMARY = '#0ea5e9'
const CHART_COLOR_SECONDARY = '#6366f1'

export default function InsightsPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [passedTickers, setPassedTickers] = useState<Set<string>>(new Set())
  const [passedList, setPassedList] = useState<Passed[]>([])
  const [passedHypothetical, setPassedHypothetical] = useState<Record<string, { hypotheticalEnd: number | null; totalReturnPct: number | null; cagr: number | null } | null>>({})
  const [heatMapYear, setHeatMapYear] = useState(() => new Date().getFullYear())
  const [heatMapMetric, setHeatMapMetric] = useState<'entries' | 'decisions' | 'both'>('both')
  const [ideasYear, setIdeasYear] = useState(() => new Date().getFullYear())
  const [metricsYear, setMetricsYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewQueueExpanded, setReviewQueueExpanded] = useState(false)
  const [reasonOppDecisionFilter, setReasonOppDecisionFilter] = useState<string>('')
  const [reasonOppReasonFilter, setReasonOppReasonFilter] = useState<string>('')
  const [reasonOppPage, setReasonOppPage] = useState(0)
  const REASON_OPP_PAGE_SIZE = 10

  useEffect(() => {
    if (passedList.length === 0) return
    let cancelled = false
    passedList.forEach((item) => {
      fetchChartData(item.ticker.trim().toUpperCase(), '5y')
        .then((data) => {
          if (cancelled) return
          const { hypotheticalEnd, totalReturnPct } = computeCounterfactualFromChart(
            data.dates,
            data.prices,
            item.passed_date,
            PASSED_HYPOTHETICAL_AMOUNT
          )
          const cagr = computeCagrFromChart(data.dates, data.prices, item.passed_date)
          setPassedHypothetical((prev) => ({
            ...prev,
            [item.id]: {
              hypotheticalEnd: hypotheticalEnd ?? null,
              totalReturnPct: totalReturnPct ?? null,
              cagr,
            },
          }))
        })
        .catch(() => {
          if (!cancelled) setPassedHypothetical((prev) => ({ ...prev, [item.id]: null }))
        })
    })
    return () => { cancelled = true }
  }, [passedList])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      listEntries({ limit: 10000 }).catch(() => []),
      listActions({ limit: 10000 }).catch(() => []),
      listOutcomes().catch(() => []),
      listPassed().catch(() => []),
    ])
      .then(([e, a, o, p]) => {
        if (cancelled) return
        setEntries(Array.isArray(e) ? e : [])
        setActions(Array.isArray(a) ? a : [])
        setOutcomes(Array.isArray(o) ? o : [])
        const passed = Array.isArray(p) ? p : []
        setPassedTickers(new Set(passed.map((x) => normalizeTickerToCompany(x.ticker))))
        setPassedList(passed)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load insights')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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
        <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
          Insights
        </Typography>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Box>
    )
  }

  const hasWriteupContent = (e: Entry) =>
    (stripMarkdown((e.title_markdown || '').trim()) + ' ' + stripMarkdown((e.body_markdown || '').trim())).trim().length >= 20

  // Exclude automated IBKR entries from all counts and calculations.
  const autoEntryIds = new Set(entries.filter(isAutomatedEntry).map((e) => e.id))
  const manualEntries = entries.filter((e) => !autoEntryIds.has(e.id))
  const manualActions = actions.filter((a) => !autoEntryIds.has(a.entry_id))
  const actionIds = new Set(manualActions.map((a) => a.id))
  const manualOutcomes = outcomes.filter((o) => actionIds.has(o.action_id))

  const writeups = manualEntries.filter(hasWriteupContent)
  const writeupsCount = writeups.length
  const entriesCount = writeupsCount
  const actionsCount = manualActions.length
  const outcomesCount = manualOutcomes.length
  // Dollar-based P&L metrics removed — IBKR data is not accurate enough for
  // quantitative analysis. We keep only count-based metrics (win/loss) and
  // post-decision tracking (how did sold/passed tickers behave after?).
  // Passed ideas: show average CAGR since each pass (no $ amount — no position size)
  const passedWithHyp = passedList.filter((p) => passedHypothetical[p.id] != null)
  const passedWithCagr = passedWithHyp.filter((p) => passedHypothetical[p.id]?.cagr != null)
  const avgCagrPassed =
    passedWithCagr.length > 0
      ? passedWithCagr.reduce((sum, p) => sum + (passedHypothetical[p.id]!.cagr ?? 0), 0) / passedWithCagr.length
      : null
  const allTags = writeups.flatMap((e) => e.tags || [])
  const tagsCount = new Set(allTags).size
  // Count unique underlying tickers (normalized to handle options like "AMTM 32342" → "AMTM")
  const ideasCount = new Set(actions.map((a) => normalizeTicker(a.ticker || '')).filter(Boolean)).size

  const byType: Record<string, number> = {}
  actions.forEach((a) => {
    byType[a.type] = (byType[a.type] ?? 0) + 1
  })
  const typeData = Object.entries(byType).map(([type, count]) => ({ type, count }))

  const byDate: Record<string, number> = {}
  actions.forEach((a) => {
    if (a.action_date) byDate[a.action_date] = (byDate[a.action_date] ?? 0) + 1
  })
  const byDateArr = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const companyCount: Record<string, { count: number; ticker: string; company_name: string | null }> = {}
  actions.forEach((a) => {
    if (!a.ticker) return
    const k = normalizeTickerToCompany(a.ticker)
    if (!k) return
    if (!companyCount[k]) {
      companyCount[k] = { count: 0, ticker: a.ticker, company_name: a.company_name || null }
    }
    companyCount[k].count += 1
  })
  const topIdeas = Object.entries(companyCount)
    .map(([companyKey, v]) => ({ companyKey, ticker: v.ticker, count: v.count, company_name: v.company_name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const actionsThisYear = actions.filter((a) => a.action_date?.startsWith(String(ideasYear)))
  const companyCountYear: Record<string, { count: number; ticker: string; company_name: string | null }> = {}
  actionsThisYear.forEach((a) => {
    if (!a.ticker) return
    const k = normalizeTickerToCompany(a.ticker)
    if (!k) return
    if (!companyCountYear[k]) {
      companyCountYear[k] = { count: 0, ticker: a.ticker, company_name: a.company_name || null }
    }
    companyCountYear[k].count += 1
  })
  const mostMentioned = Object.entries(companyCountYear)
    .map(([companyKey, v]) => ({ companyKey, ticker: v.ticker, count: v.count, company_name: v.company_name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const reasonCount: Record<string, number> = {}
  const reasonReturnPcts: Record<string, number[]> = {}
  const outcomeByActionId = new Map<string, Outcome>()
  outcomes.forEach((o) => outcomeByActionId.set(o.action_id, o))
  actions.forEach((a) => {
    const rawReason = stripMarkdown((a.reason || '').trim())
    // Skip automated import entries — they pollute the reason analysis
    if (!rawReason || /automated|ibkr|import/i.test(rawReason)) return
    const r = rawReason || 'No reason'
    reasonCount[r] = (reasonCount[r] ?? 0) + 1
    const outcome = outcomeByActionId.get(a.id)
    if (outcome?.realized_pnl != null) {
      const price = parsePrice(a.price)
      const shares = a.shares != null && a.shares > 0 ? a.shares : 1
      if (price != null && price * shares !== 0) {
        const returnPct = (Number(outcome.realized_pnl) / (price * shares)) * 100
        if (!reasonReturnPcts[r]) reasonReturnPcts[r] = []
        reasonReturnPcts[r].push(returnPct)
      }
    }
  })
  const totalReasons = actions.length
  const reasonData = Object.entries(reasonCount)
    .map(([reason, count]) => {
      const pcts = reasonReturnPcts[reason] ?? []
      const avgReturnPct = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null
      return {
        reason,
        count,
        pct: totalReasons ? Math.round((count / totalReasons) * 100) : 0,
        avgReturnPct,
        withReturnCount: pcts.length,
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // Reason opportunity return: avg CAGR since pass, by pass reason
  const reasonOpportunityByReason: Record<string, number[]> = {}
  passedList.forEach((p) => {
    const rawR = stripMarkdown((p.reason || '').trim())
    if (!rawR || /automated|ibkr|import/i.test(rawR)) return
    const r = rawR || 'No reason'
    const cagr = passedHypothetical[p.id]?.cagr
    if (cagr == null) return
    if (!reasonOpportunityByReason[r]) reasonOpportunityByReason[r] = []
    reasonOpportunityByReason[r].push(cagr)
  })
  const reasonOpportunityData = Object.entries(reasonOpportunityByReason)
    .map(([reason, cagrs]) => ({ reason, count: cagrs.length, avgCagr: cagrs.reduce((a, b) => a + b, 0) / cagrs.length }))
    .sort((a, b) => b.avgCagr - a.avgCagr)

  // Actions with return % (from realized outcomes) for Reason opportunity return table.
  // Outcomes are attached to the closing action (sell/trim). We link each to the entry action (buy/add_more) when present so we can filter and show by "buy" reason.
  const outcomeByActionIdMap = new Map<string, Outcome>()
  outcomes.forEach((o) => outcomeByActionIdMap.set(o.action_id, o))
  const closedDecisionsWithReturn: { closingAction: Action; entryAction: Action | null; returnPct: number }[] = []
  actions.forEach((closingAction) => {
    const outcome = outcomeByActionIdMap.get(closingAction.id)
    if (outcome?.realized_pnl == null) return
    const price = parsePrice(closingAction.price)
    const shares = closingAction.shares != null && closingAction.shares > 0 ? closingAction.shares : 1
    if (price == null || price * shares === 0) return
    const returnPct = (Number(outcome.realized_pnl) / (price * shares)) * 100
    const ticker = closingAction.ticker?.toUpperCase()
    const closeDate = closingAction.action_date
    const entryAction: Action | null = ticker
      ? actions
          .filter(
            (a) =>
              a.ticker?.toUpperCase() === ticker &&
              (a.type === 'buy' || a.type === 'add_more') &&
              a.action_date <= closeDate &&
              a.id !== closingAction.id
          )
          .sort((a, b) => (b.action_date > a.action_date ? 1 : -1))[0] ?? null
      : null
    closedDecisionsWithReturn.push({ closingAction, entryAction, returnPct })
  })
  const reasonOpts = Array.from(
    new Set(
      closedDecisionsWithReturn.map((x) => stripMarkdown((x.closingAction.reason || 'No reason').trim()) || 'No reason')
    )
  ).sort()
  // Closed decisions = sell/trim with outcome. Filter by closing type (Sold, Trimmed) and by reason.
  const closedDecisionTypes = ['sell', 'trim'] as const
  const reasonOppFiltered = closedDecisionsWithReturn.filter((x) => {
    const reason = stripMarkdown((x.closingAction.reason || 'No reason').trim()) || 'No reason'
    if (reasonOppDecisionFilter && x.closingAction.type !== reasonOppDecisionFilter) return false
    if (reasonOppReasonFilter && reason !== reasonOppReasonFilter) return false
    return true
  })
  const reasonOppOverall = reasonOppFiltered.length ? reasonOppFiltered.reduce((s, x) => s + x.returnPct, 0) / reasonOppFiltered.length : null
  const reasonOppPaginated = reasonOppFiltered.slice(reasonOppPage * REASON_OPP_PAGE_SIZE, (reasonOppPage + 1) * REASON_OPP_PAGE_SIZE)
  const reasonOppTotalPages = Math.ceil(reasonOppFiltered.length / REASON_OPP_PAGE_SIZE)

  const withPnl = outcomes.filter((o) => o.realized_pnl != null)
  const wins = withPnl.filter((o) => Number(o.realized_pnl) > 0).length
  const losses = withPnl.filter((o) => Number(o.realized_pnl) < 0).length
  const winPct = withPnl.length ? Math.round((wins / withPnl.length) * 100) : null
  const losePct = withPnl.length ? Math.round((losses / withPnl.length) * 100) : null
  const twoByTwo = { goodGood: 0, goodBad: 0, badGood: 0, badBad: 0 }
  outcomes.forEach((o) => {
    const p = o.process_quality
    const q = o.outcome_quality
    if (p === 'good' && q === 'good') twoByTwo.goodGood += 1
    else if (p === 'good' && q === 'bad') twoByTwo.goodBad += 1
    else if (p === 'bad' && q === 'good') twoByTwo.badGood += 1
    else if (p === 'bad' && q === 'bad') twoByTwo.badBad += 1
  })
  const twoByTwoTotal = twoByTwo.goodGood + twoByTwo.goodBad + twoByTwo.badGood + twoByTwo.badBad

  const errorTypeCount: Record<string, number> = {}
  outcomes.forEach((o) => {
    (o.error_type ?? []).forEach((t: ErrorType) => {
      errorTypeCount[t] = (errorTypeCount[t] ?? 0) + 1
    })
  })
  const errorTypeData = Object.entries(errorTypeCount).map(([type, count]) => ({
    type: ERROR_TYPE_LABELS[type as ErrorType],
    count,
  }))

  const entryByMonth: Record<string, number> = {}
  const actionByMonth: Record<string, number> = {}
  const yearStr = String(heatMapYear)
  const entryByDate: Record<string, number> = {}
  const actionByDate: Record<string, number> = {}
  writeups.forEach((e) => {
    if (e.date?.startsWith(yearStr)) {
      const month = e.date.slice(5, 7)
      entryByMonth[month] = (entryByMonth[month] ?? 0) + 1
      entryByDate[e.date] = (entryByDate[e.date] ?? 0) + 1
    }
  })
  actions.forEach((a) => {
    if (a.action_date?.startsWith(yearStr)) {
      const month = a.action_date.slice(5, 7)
      actionByMonth[month] = (actionByMonth[month] ?? 0) + 1
      actionByDate[a.action_date] = (actionByDate[a.action_date] ?? 0) + 1
    }
  })
  // Calendar heat map: one cell per day (week rows × 7 cols). Rows = calendar weeks (Sun–Sat); use local date for keys so timezone doesn't shift days.
  const heatMapCalendarCells: { date: string; week: number; dow: number; entries: number; decisions: number }[] = []
  const yearStart = new Date(heatMapYear, 0, 1)
  const yearEnd = new Date(heatMapYear, 11, 31)
  const firstSunday = new Date(yearStart)
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay())
  for (let d = new Date(yearStart); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const week = Math.floor((d.getTime() - firstSunday.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const dow = d.getDay()
    heatMapCalendarCells.push({
      date: dateStr,
      week,
      dow,
      entries: entryByDate[dateStr] ?? 0,
      decisions: actionByDate[dateStr] ?? 0,
    })
  }
  const heatMapValue = (c: { entries: number; decisions: number }) =>
    heatMapMetric === 'entries' ? c.entries : heatMapMetric === 'decisions' ? c.decisions : c.entries + c.decisions
  // Aggregate by day-of-week (OY) and month (OX): heatMapMonthDow[dow][monthIndex] = { entries, decisions }
  const heatMapMonthDow: { entries: number; decisions: number }[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 12 }, () => ({ entries: 0, decisions: 0 }))
  )
  heatMapCalendarCells.forEach((c) => {
    const monthIndex = parseInt(c.date.slice(5, 7), 10) - 1
    if (monthIndex >= 0 && monthIndex < 12) {
      heatMapMonthDow[c.dow][monthIndex].entries += c.entries
      heatMapMonthDow[c.dow][monthIndex].decisions += c.decisions
    }
  })
  const heatMapMax = Math.max(
    1,
    ...heatMapMonthDow.flatMap((row) => row.map((c) => heatMapValue(c)))
  )
  const heatMapCellColor = (entries: number, decisions: number) => {
    const v = heatMapValue({ entries, decisions })
    if (v <= 0) return 'rgba(0,0,0,0.06)'
    const intensity = Math.min(1, v / heatMapMax)
    return `rgba(25, 118, 210, ${0.15 + intensity * 0.7})`
  }
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const heatMapCellDates = (dow: number, monthIndex: number) =>
    heatMapCalendarCells.filter((c) => c.dow === dow && parseInt(c.date.slice(5, 7), 10) - 1 === monthIndex).map((c) => c.date)
  const formatHeatMapDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-')
    return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${heatMapYear}`
  }
  const renderHeatMapCellTooltip = (dow: number, monthIndex: number) => {
    const datesInCell = heatMapCellDates(dow, monthIndex)
    const totalEntries = datesInCell.reduce((s, d) => s + (entryByDate[d] ?? 0), 0)
    const totalDecisions = datesInCell.reduce((s, d) => s + (actionByDate[d] ?? 0), 0)
    const datesWithActivity = datesInCell.filter((d) => (entryByDate[d] ?? 0) + (actionByDate[d] ?? 0) > 0)
    return (
      <Box sx={{ p: 1, maxWidth: 320, maxHeight: 360, overflow: 'auto' }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {WEEKDAYS[dow]}s in {MONTH_LABELS[monthIndex]} {heatMapYear}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          {totalEntries} journal entries · {totalDecisions} trades
        </Typography>
        {datesWithActivity.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No activity</Typography>
        ) : (
          datesWithActivity.map((dateStr) => (
            <Box key={dateStr} sx={{ mt: 0.75 }}>
              <Typography variant="caption" fontWeight={600} display="block">
                {formatHeatMapDate(dateStr)}
              </Typography>
              {writeups.filter((e) => e.date === dateStr).map((entry) => (
                <Link
                  component={RouterLink}
                  to={`/entries/${entry.id}`}
                  key={entry.id}
                  underline="hover"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'inherit' }}
                >
                  <ArticleOutlinedIcon sx={{ fontSize: 14 }} />
                  Entry{entry.title_markdown ? `: ${stripMarkdown(entry.title_markdown).slice(0, 50)}${stripMarkdown(entry.title_markdown).length > 50 ? '…' : ''}` : ''}
                </Link>
              ))}
              {actions.filter((a) => a.action_date === dateStr).map((action) => {
                const ideaKey = encodeURIComponent(normalizeTickerToCompany(action.ticker) || action.ticker?.toUpperCase() || '')
                const actionLabel =
                  action.type === 'buy' ? 'Bought' : action.type === 'sell' ? 'Sold' : action.type === 'add_more' ? 'Added' : action.type === 'trim' ? 'Trimmed' : action.type
                return (
                  <Link
                    component={RouterLink}
                    to={`/ideas/${ideaKey}`}
                    key={action.id}
                    underline="hover"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'inherit' }}
                  >
                    {action.type === 'buy' || action.type === 'add_more' ? (
                      <TrendingUpIcon sx={{ fontSize: 14 }} />
                    ) : action.type === 'sell' || action.type === 'trim' ? (
                      <TrendingDownIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ArticleOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                    {actionLabel} <strong>{action.ticker}</strong>
                  </Link>
                )
              })}
            </Box>
          ))
        )}
      </Box>
    )
  }

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const cutoff = sixMonthsAgo.toISOString().slice(0, 7)
  const activityByMonth: Record<string, { entries: number; decisions: number }> = {}
  for (let i = 0; i < 6; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const key = d.toISOString().slice(0, 7)
    activityByMonth[key] = { entries: 0, decisions: 0 }
  }
  writeups.forEach((e) => {
    if (e.date >= cutoff) {
      const key = e.date.slice(0, 7)
      if (activityByMonth[key]) activityByMonth[key].entries += 1
    }
  })
  actions.forEach((a) => {
    if (a.action_date >= cutoff) {
      const key = a.action_date.slice(0, 7)
      if (activityByMonth[key]) activityByMonth[key].decisions += 1
    }
  })
  const activityData = Object.entries(activityByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ ...v, label: k.slice(0, 7) }))

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const weekCutoff = fourWeeksAgo.toISOString().slice(0, 10)
  const entriesLast4 = writeups.filter((e) => e.date >= weekCutoff).length
  const actionsLast4 = actions.filter((a) => a.action_date >= weekCutoff).length
  const entriesPerWeek = Math.round((entriesLast4 / 4) * 10) / 10
  const decisionsPerWeek = Math.round((actionsLast4 / 4) * 10) / 10
  const tagCountLast4: Record<string, number> = {}
  writeups
    .filter((e) => e.date >= weekCutoff)
    .flatMap((e) => e.tags || [])
    .forEach((t) => {
      tagCountLast4[t] = (tagCountLast4[t] ?? 0) + 1
    })
  const topTagsLast4 = Object.entries(tagCountLast4)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const entryByWeekday: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  const actionByWeekday: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  writeups.forEach((e) => {
    if (e.date) {
      const d = new Date(e.date + 'Z')
      entryByWeekday[d.getUTCDay()] = (entryByWeekday[d.getUTCDay()] ?? 0) + 1
    }
  })
  actions.forEach((a) => {
    if (a.action_date) {
      const d = new Date(a.action_date + 'Z')
      actionByWeekday[d.getUTCDay()] = (actionByWeekday[d.getUTCDay()] ?? 0) + 1
    }
  })
  const totalEntriesForPct = Object.values(entryByWeekday).reduce((s, n) => s + n, 0)
  const totalDecisionsForPct = Object.values(actionByWeekday).reduce((s, n) => s + n, 0)
  const dailyData = WEEKDAYS.map((name, i) => ({
    day: name,
    entries: entryByWeekday[i] ?? 0,
    decisions: actionByWeekday[i] ?? 0,
    entryPct: totalEntriesForPct ? Math.round(((entryByWeekday[i] ?? 0) / totalEntriesForPct) * 100) : 0,
    decisionPct: totalDecisionsForPct ? Math.round(((actionByWeekday[i] ?? 0) / totalDecisionsForPct) * 100) : 0,
  }))

  // Streaks: days with at least one journal entry in last 365 days
  const oneYearAgoStr = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const entryDatesLast365 = new Set(writeups.filter((e) => e.date >= oneYearAgoStr).map((e) => e.date))
  const decisionsLast365 = actions.filter((a) => a.action_date >= oneYearAgoStr).length
  const sortedEntryDates = Array.from(entryDatesLast365).sort()
  let currentStreak = 0
  const today = new Date().toISOString().slice(0, 10)
  for (let d = today; d >= oneYearAgoStr; d = new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10)) {
    if (entryDatesLast365.has(d)) currentStreak++
    else break
  }
  let longestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const d of sortedEntryDates) {
    if (prev && new Date(d).getTime() - new Date(prev).getTime() > 86400000) run = 0
    run++
    prev = d
    if (run > longestStreak) longestStreak = run
  }
  if (sortedEntryDates.length > 0 && run > longestStreak) longestStreak = run

  // Last 4 weeks: tags/week, ideas/week, new ideas (first action in period)
  const ideasLast4 = new Set(actions.filter((a) => a.action_date >= weekCutoff && a.ticker).map((a) => normalizeTickerToCompany(a.ticker)))
  const firstActionByTicker: Record<string, string> = {}
  actions.forEach((a) => {
    if (!a.ticker) return
    const k = normalizeTickerToCompany(a.ticker)
    if (!k) return
    if (!firstActionByTicker[k] || (a.action_date && a.action_date < firstActionByTicker[k])) {
      firstActionByTicker[k] = a.action_date || ''
    }
  })
  const newIdeasLast4 = Object.keys(firstActionByTicker).filter((k) => firstActionByTicker[k] >= weekCutoff).length
  const distinctTagsLast4 = Object.keys(tagCountLast4).length
  const tagsPerWeek = Math.round((distinctTagsLast4 / 4) * 10) / 10
  const ideasPerWeek = Math.round((ideasLast4.size / 4) * 10) / 10

  // Metrics by year (for selected year)
  const actionsInMetricsYear = actions.filter((a) => a.action_date?.startsWith(String(metricsYear)))
  const ideasInYear = new Set(actionsInMetricsYear.map((a) => normalizeTickerToCompany(a.ticker)).filter(Boolean))
  const newIdeasInYear = Object.keys(firstActionByTicker).filter((k) => firstActionByTicker[k]?.startsWith(String(metricsYear))).length
  const decisionsByTypeYear: Record<string, number> = {}
  actionsInMetricsYear.forEach((a) => {
    decisionsByTypeYear[a.type] = (decisionsByTypeYear[a.type] ?? 0) + 1
  })
  const entriesInMetricsYear = writeups.filter((e) => e.date?.startsWith(String(metricsYear))).length

  // Idea status: Pass / Sold / Other (and Currently own if last action is buy/add_more)
  const tickerToLastAction: Record<string, Action> = {}
  actions.forEach((a) => {
    if (!a.ticker) return
    const k = normalizeTickerToCompany(a.ticker)
    if (!k) return
    const existing = tickerToLastAction[k]
    if (!existing || (a.action_date && a.action_date > (existing.action_date || ''))) {
      tickerToLastAction[k] = a
    }
  })
  const ideaStatusCounts = { pass: 0, sold: 0, own: 0, other: 0 }
  Object.entries(tickerToLastAction).forEach(([k, a]) => {
    if (passedTickers.has(k)) {
      ideaStatusCounts.pass += 1
      return
    }
    if (a.type === 'sell' || a.type === 'short' || a.type === 'trim') {
      ideaStatusCounts.sold += 1
      return
    }
    if (a.type === 'buy' || a.type === 'add_more') {
      ideaStatusCounts.own += 1
      return
    }
    ideaStatusCounts.other += 1
  })
  const ideaStatusTotal = ideaStatusCounts.pass + ideaStatusCounts.sold + ideaStatusCounts.own + ideaStatusCounts.other
  const ideaStatusPct = ideaStatusTotal > 0
    ? {
        pass: Math.round((ideaStatusCounts.pass / ideaStatusTotal) * 100),
        sold: Math.round((ideaStatusCounts.sold / ideaStatusTotal) * 100),
        own: Math.round((ideaStatusCounts.own / ideaStatusTotal) * 100),
        other: Math.round((ideaStatusCounts.other / ideaStatusTotal) * 100),
      }
    : null

  // Daily averages as percentage of total
  const entryPctByDay = WEEKDAYS.map((_, i) => ({
    day: WEEKDAYS[i],
    pct: totalEntriesForPct ? Math.round(((entryByWeekday[i] ?? 0) / totalEntriesForPct) * 100) : 0,
  }))
  const decisionPctByDay = WEEKDAYS.map((_, i) => ({
    day: WEEKDAYS[i],
    pct: totalDecisionsForPct ? Math.round(((actionByWeekday[i] ?? 0) / totalDecisionsForPct) * 100) : 0,
  }))

  const availableYears = new Set([
    ...writeups.map((e) => e.date?.slice(0, 4)).filter(Boolean),
    ...actions.map((a) => a.action_date?.slice(0, 4)).filter(Boolean),
    String(new Date().getFullYear()),
  ])
  const heatMapYearsSorted = Array.from(availableYears).map(Number).sort((a, b) => a - b)
  const heatMapYearMin = heatMapYearsSorted[0] ?? heatMapYear
  const heatMapYearMax = heatMapYearsSorted[heatMapYearsSorted.length - 1] ?? heatMapYear

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Insights
      </Typography>

      {/* Dashboard metric tiles — Simply Wall St–style: label above, big value */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Journal entries
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' } }}>{entriesCount}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>writeups</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Trades / decisions
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' } }}>{actionsCount}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Outcomes
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' } }}>{outcomesCount}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 2 }, bgcolor: 'grey.50', height: '100%' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.04em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Opportunity cost (passed)
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' } }} color={avgCagrPassed != null ? (avgCagrPassed > 0 ? 'warning.main' : avgCagrPassed < 0 ? 'success.main' : 'text.secondary') : 'text.secondary'}>
              {passedList.length === 0 ? '—' : passedWithCagr.length === 0 ? '…' : formatCagrPercent(avgCagrPassed)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {passedList.length === 0 ? 'No passed ideas' : passedWithCagr.length < passedList.length ? `Avg CAGR since pass (${passedWithCagr.length}/${passedList.length})` : 'Avg CAGR since each pass'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Last 4 weeks + All time summary blocks */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Last 4 weeks
            </Typography>
            <Typography variant="body1">
              {entriesPerWeek} avg journal entries/week · {decisionsPerWeek} avg trades/week
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagsPerWeek} avg tags/week · {ideasPerWeek} avg ideas/week · {newIdeasLast4} new ideas
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              All time
            </Typography>
            <Typography variant="body1">
              {entriesCount} journal entries · {actionsCount} trades
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagsCount} Tags · {ideasCount} Ideas
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1, mt: 1 }}>
        Activity
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.02em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              All time
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {entriesCount} journal entries · {actionsCount} trades
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagsCount} Tags · {ideasCount} Ideas
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="caption" fontWeight={500} sx={{ letterSpacing: '0.02em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Last 4 weeks
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {entriesPerWeek} avg journal entries/week · {decisionsPerWeek} avg trades/week
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tagsPerWeek} avg tags/week · {ideasPerWeek} avg ideas/week · {newIdeasLast4} new ideas
            </Typography>
            {topTagsLast4.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {topTagsLast4.map(([tag, n]) => (
                  <Chip key={tag} label={`#${tag} (${n})`} size="small" />
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 1, height: '100%' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.25} sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600} letterSpacing={0.5} color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Heat map
              </Typography>
              <Box display="flex" alignItems="center" gap={0.25}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Less</Typography>
                {[0, 0.33, 0.66, 1].map((t) => (
                  <Box
                    key={t}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: 0.25,
                      bgcolor: t === 0 ? 'rgba(0,0,0,0.06)' : `rgba(25, 118, 210, ${0.15 + t * 0.7})`,
                    }}
                  />
                ))}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>More</Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" flexWrap="wrap" gap={0.25} sx={{ mb: 0.5 }}>
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setHeatMapYear((y) => (y <= heatMapYearMin ? y : y - 1))} aria-label="Previous year">
                <ChevronLeft sx={{ fontSize: 16 }} />
              </IconButton>
              <Typography variant="caption" fontWeight={600} sx={{ minWidth: 28, textAlign: 'center', fontSize: '0.7rem' }}>{heatMapYear}</Typography>
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setHeatMapYear((y) => (y >= heatMapYearMax ? y : y + 1))} aria-label="Next year">
                <ChevronRight sx={{ fontSize: 16 }} />
              </IconButton>
              <FormControl size="small" variant="outlined" sx={{ minWidth: 72, ml: 0.25, '& .MuiInputBase-root': { fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.35 } }}>
                <InputLabel sx={{ fontSize: '0.7rem' }}>Show</InputLabel>
                <Select value={heatMapMetric} label="Show" onChange={(e) => setHeatMapMetric(e.target.value as 'entries' | 'decisions' | 'both')} sx={{ fontSize: '0.7rem' }}>
                  <MenuItem value="entries" sx={{ fontSize: '0.7rem' }}>Journal entries</MenuItem>
                  <MenuItem value="decisions" sx={{ fontSize: '0.7rem' }}>Trades</MenuItem>
                  <MenuItem value="both" sx={{ fontSize: '0.7rem' }}>Both</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ width: '100%', maxWidth: '100%', mb: 0.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(12, 1fr)', gridTemplateRows: 'auto repeat(7, 14px)', gap: 0.4, width: '100%' }}>
                <Box />
                {MONTH_LABELS.map((m) => (
                  <Box key={m} sx={{ textAlign: 'center', lineHeight: 1, minWidth: 0 }}>
                    <Typography component="span" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{m}</Typography>
                  </Box>
                ))}
                {WEEKDAYS.map((dayName, dow) => (
                  <Box key={dow} sx={{ display: 'contents' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', pr: 0.25 }}>
                      <Typography component="span" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{dayName.slice(0, 2)}</Typography>
                    </Box>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((monthIndex) => {
                      const cell = heatMapMonthDow[dow][monthIndex]
                      const entries = cell.entries
                      const decisions = cell.decisions
                      return (
                        <MuiTooltip
                          key={`${dow}-${monthIndex}`}
                          title={renderHeatMapCellTooltip(dow, monthIndex)}
                          placement="right"
                          arrow
                          leaveDelay={200}
                          slotProps={{ popper: { sx: { '& .MuiTooltip-tooltip': { maxWidth: 340 } } } }}
                        >
                          <Box
                            component="span"
                            sx={{
                              width: '100%',
                              height: 14,
                              borderRadius: 0.5,
                              bgcolor: heatMapCellColor(entries, decisions),
                              cursor: 'default',
                              display: 'block',
                              minWidth: 0,
                            }}
                          />
                        </MuiTooltip>
                      )
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
              {entryDatesLast365.size} journal entries · {decisionsLast365} trades in last 365 days · Entry streak: {currentStreak} · Longest: {longestStreak}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                Metrics
              </Typography>
              <FormControl size="small" variant="outlined" sx={{ minWidth: 72, '& .MuiInputBase-root': { fontSize: '0.7rem' } }}>
                <InputLabel sx={{ fontSize: '0.7rem' }}>Year</InputLabel>
                <Select value={metricsYear} label="Year" onChange={(e) => setMetricsYear(Number(e.target.value))} sx={{ fontSize: '0.7rem' }}>
                  {Array.from(availableYears)
                    .sort((a, b) => Number(b) - Number(a))
                    .map((y) => (
                      <MenuItem key={y} value={Number(y)} sx={{ fontSize: '0.7rem' }}>{y}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Box>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>Ideas</Typography>
            <Typography variant="body2" sx={{ mb: 0.5, fontSize: '0.8rem' }}>
              {ideasInYear.size} ideas mentioned · {newIdeasInYear} new ideas · {entriesInMetricsYear} journal entries
            </Typography>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>Trades (decisions)</Typography>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              {actionsInMetricsYear.length} total trades
              {['buy', 'sell', 'pass', 'hold', 'trim', 'short', 'add_more', 'speculate', 'research', 'watchlist'].map((t) => {
                const n = decisionsByTypeYear[t] ?? 0
                return n > 0 ? ` · ${n} ${t.replace('_', ' ')}` : null
              }).filter(Boolean).join('')}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {activityData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Activity over the last 6 months
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Bars: journal entries (writeups). Line: trades (right axis).
          </Typography>
          <Box sx={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={activityData} margin={{ top: 16, right: 48, left: 48, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#334155' }} />
                <YAxis yAxisId="left" domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                <Tooltip contentStyle={{ fontSize: 13 }} />
                <Legend />
                <Bar yAxisId="left" dataKey="entries" name="Journal entries" fill={CHART_COLOR_PRIMARY} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="decisions" name="Trades" stroke={CHART_COLOR_SECONDARY} strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {typeData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Metrics · Trades by type
          </Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData} margin={{ top: 16, right: 24, left: 48, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                <XAxis dataKey="type" tick={{ fontSize: 13, fill: '#334155' }} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                <Tooltip contentStyle={{ fontSize: 13 }} />
                <Bar dataKey="count" fill={CHART_COLOR_PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {topIdeas.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Top 10 ideas
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {topIdeas.map(({ companyKey, ticker, count, company_name }) => (
                  <Box component="li" key={companyKey} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <Typography variant="body2" fontWeight={700} component="span" sx={{ minWidth: 20 }}>{count}</Typography>
                    <Typography variant="body2" color="text.secondary" component="span" sx={{ flex: 1, minWidth: 0 }}>{company_name || companyKey}</Typography>
                    <Chip
                      label={ticker ? getTickerDisplayLabel(ticker) || `$${ticker}` : `$${companyKey}`}
                      size="small"
                      component={RouterLink}
                      to={`/ideas/${encodeURIComponent(companyKey)}`}
                      clickable
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        )}
        {(winPct != null || losePct != null) && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Closed decisions (for comparison)
              </Typography>
              <Typography variant="body2">
                {wins} ({winPct ?? 0}%) winning · {losses} ({losePct ?? 0}%) losing
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {withPnl.length} outcomes with realized P&L — use to compare with passed opportunity cost and unrealized, not as primary metric.
              </Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {ideaStatusTotal > 0 && ideaStatusPct && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Idea status
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                How your {ideaStatusTotal} ideas are classified by latest decision
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: '100%', maxWidth: 220, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Pie
                        data={[
                          { name: 'Currently own', value: ideaStatusPct.own, color: '#22c55e' },
                          { name: 'Sold', value: ideaStatusPct.sold, color: '#ef4444' },
                          { name: 'Pass', value: ideaStatusPct.pass, color: '#f59e0b' },
                          { name: 'Other', value: ideaStatusPct.other, color: '#6366f1' },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={64}
                        paddingAngle={1}
                        dataKey="value"
                        nameKey="name"
                        label={(props: { name?: string; value?: number; cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; payload?: { name?: string; value?: number } }) => {
                          const { name = props.payload?.name ?? '', value = props.payload?.value ?? 0, cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0 } = props
                          const RADIAN = Math.PI / 180
                          const radius = (innerRadius + outerRadius) / 2 + (outerRadius - innerRadius) * 0.3
                          const x = cx + radius * Math.cos(-midAngle * RADIAN)
                          const y = cy + radius * Math.sin(-midAngle * RADIAN)
                          return (
                            <text x={x} y={y} fill="currentColor" textAnchor={x >= cx ? 'start' : 'end'} dominantBaseline="central" style={{ fontSize: 11 }}>
                              {name} {value}%
                            </text>
                          )
                        }}
                        labelLine={{ stroke: 'currentColor', strokeWidth: 1 }}
                      >
                        {[
                          { name: 'Currently own', value: ideaStatusPct.own, color: '#22c55e' },
                          { name: 'Sold', value: ideaStatusPct.sold, color: '#ef4444' },
                          { name: 'Pass', value: ideaStatusPct.pass, color: '#f59e0b' },
                          { name: 'Other', value: ideaStatusPct.other, color: '#6366f1' },
                        ]
                          .filter((d) => d.value > 0)
                          .map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                      </Pie>
                      <Tooltip formatter={(v: number | undefined) => [v != null ? `${v}%` : '', 'Share']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignSelf: 'center' }}>
                  {ideaStatusPct.own > 0 && <Chip size="small" label={`${ideaStatusPct.own}% Currently own`} color="success" variant="outlined" />}
                  {ideaStatusPct.sold > 0 && <Chip size="small" label={`${ideaStatusPct.sold}% Sold`} color="error" variant="outlined" />}
                  {ideaStatusPct.pass > 0 && <Chip size="small" label={`${ideaStatusPct.pass}% Pass`} variant="outlined" />}
                  {ideaStatusPct.other > 0 && <Chip size="small" label={`${ideaStatusPct.other}% Other`} variant="outlined" />}
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {mostMentioned.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Most mentioned ideas
            </Typography>
            <FormControl size="small" variant="outlined" sx={{ minWidth: 90 }}>
              <InputLabel>Year</InputLabel>
              <Select value={ideasYear} label="Year" onChange={(e) => setIdeasYear(Number(e.target.value))}>
                {Array.from(availableYears)
                  .sort((a, b) => Number(b) - Number(a))
                  .map((y) => (
                    <MenuItem key={y} value={Number(y)}>{y}</MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {mostMentioned.slice(0, 10).map(({ companyKey, ticker, count, company_name }) => (
              <Box component="li" key={companyKey} sx={{ py: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 28 }}>{count} {count === 1 ? 'entry' : 'entries'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>{company_name || companyKey}</Typography>
                <Chip
                  label={ticker ? getTickerDisplayLabel(ticker) || `$${ticker}` : `$${companyKey}`}
                  size="small"
                  component={RouterLink}
                  to={`/ideas/${encodeURIComponent(companyKey)}`}
                  clickable
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {reasonData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Reason comparison
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Decision reasons, share of total, and avg return % (from closed decisions)
          </Typography>
          <Box sx={{ height: Math.max(400, reasonData.length * 48), mb: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reasonData.map((r) => ({
                  ...r,
                  label: r.reason.length > 32 ? r.reason.slice(0, 32) + '…' : r.reason,
                  avgReturnPctRounded: r.avgReturnPct != null ? Math.round(r.avgReturnPct * 10) / 10 : null,
                }))}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#334155' }} />
                <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 12, fill: '#334155' }} />
                <Tooltip
                  formatter={(
                    _v: number | undefined,
                    _n: string | undefined,
                    item: { payload?: { reason: string; count: number; pct: number; avgReturnPct: number | null; withReturnCount: number } }
                  ) => {
                    const p = item?.payload
                    if (!p) return undefined
                    const lines = [`${p.count} (${p.pct}%)`]
                    if (p.avgReturnPct != null) lines.push(`Avg return: ${p.avgReturnPct >= 0 ? '+' : ''}${p.avgReturnPct.toFixed(1)}% (n=${p.withReturnCount})`)
                    return [lines.join(' · '), 'Decisions']
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" name="Decisions" fill={CHART_COLOR_PRIMARY} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Table size="small" sx={{ '& td, & th': { py: 0.5, borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Reason</TableCell>
                <TableCell align="right">Count</TableCell>
                <TableCell align="right">%</TableCell>
                <TableCell align="right">Avg return</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reasonData.map((r) => (
                <TableRow key={r.reason}>
                  <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                    {r.reason}
                  </TableCell>
                  <TableCell align="right">{r.count}</TableCell>
                  <TableCell align="right">{r.pct}%</TableCell>
                  <TableCell align="right">
                    {r.avgReturnPct != null ? (
                      <Typography component="span" variant="body2" color={r.avgReturnPct >= 0 ? 'success.main' : 'error.main'}>
                        {r.avgReturnPct >= 0 ? '+' : ''}{r.avgReturnPct.toFixed(1)}%
                      </Typography>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {reasonOpportunityData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Reason opportunity return (passed)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Avg CAGR since pass, by reason you passed. Higher = bigger missed upside when you passed for that reason.
          </Typography>
          <Box sx={{ height: 220, mb: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={reasonOpportunityData.map((r) => ({
                  ...r,
                  label: r.reason.length > 16 ? r.reason.slice(0, 16) + '…' : r.reason,
                  avgCagrPct: Math.round(r.avgCagr * 10) / 10,
                }))}
                margin={{ top: 8, right: 24, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#334155' }} />
                <YAxis tick={{ fontSize: 12, fill: '#334155' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(
                    _v: number | undefined,
                    _n: string | undefined,
                    item: { payload?: { reason: string; count: number; avgCagr: number } }
                  ) => (item?.payload ? [formatCagrPercent(item.payload.avgCagr), `Avg CAGR (n=${item.payload.count})`] : undefined)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="avgCagrPct" name="Avg CAGR %" fill={CHART_COLOR_SECONDARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Table size="small" sx={{ '& td, & th': { py: 0.5, borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Pass reason</TableCell>
                <TableCell align="right">Passes</TableCell>
                <TableCell align="right">Avg CAGR</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reasonOpportunityData.map((r) => (
                <TableRow key={r.reason}>
                  <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                    {r.reason}
                  </TableCell>
                  <TableCell align="right">{r.count}</TableCell>
                  <TableCell align="right" sx={{ color: r.avgCagr >= 0 ? 'success.main' : 'text.secondary' }}>
                    {formatCagrPercent(r.avgCagr)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {closedDecisionsWithReturn.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Reason opportunity return (closed decisions)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Only closed decisions (Sold, Trimmed). Filter by type and reason; table shows return % from realized P&L.
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            <FormControl size="small" variant="outlined" sx={{ minWidth: 120 }}>
              <InputLabel>Decision</InputLabel>
              <Select
                value={reasonOppDecisionFilter}
                label="Decision"
                onChange={(e) => { setReasonOppDecisionFilter(e.target.value); setReasonOppPage(0) }}
              >
                <MenuItem value="">All</MenuItem>
                {closedDecisionTypes.map((t) => (
                  <MenuItem key={t} value={t}>
                    <DecisionChip type={t} size="small" sx={{ pointerEvents: 'none' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" variant="outlined" sx={{ minWidth: 140 }}>
              <InputLabel>Reason</InputLabel>
              <Select
                value={reasonOppReasonFilter}
                label="Reason"
                onChange={(e) => { setReasonOppReasonFilter(e.target.value); setReasonOppPage(0) }}
              >
                <MenuItem value="">All</MenuItem>
                {reasonOpts.map((r) => (
                  <MenuItem key={r} value={r}>{r.length > 30 ? r.slice(0, 30) + '…' : r}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {reasonOppOverall != null && (
            <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }} color={reasonOppOverall >= 0 ? 'success.main' : 'error.main'}>
              {reasonOppOverall >= 0 ? '+' : ''}{reasonOppOverall.toFixed(1)}% overall (n={reasonOppFiltered.length})
            </Typography>
          )}
          <Table size="small" sx={{ '& td, & th': { py: 0.5, borderColor: 'divider' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Return</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reasonOppPaginated.map((row) => {
                const action = row.closingAction
                return (
                <TableRow key={row.closingAction.id}>
                  <TableCell><DecisionChip type={action.type} size="small" /></TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(action.ticker) || action.ticker?.toUpperCase() || '')}`} underline="hover" fontWeight={600}>
                      {action.ticker ? getTickerDisplayLabel(action.ticker) : '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{action.action_date}</TableCell>
                  <TableCell align="right">
                    <Typography component="span" variant="body2" color={row.returnPct >= 0 ? 'success.main' : 'error.main'}>
                      {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(1)}%
                    </Typography>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
          {reasonOppTotalPages > 1 && (
            <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {reasonOppPage * REASON_OPP_PAGE_SIZE + 1}-{Math.min((reasonOppPage + 1) * REASON_OPP_PAGE_SIZE, reasonOppFiltered.length)} of {reasonOppFiltered.length}
              </Typography>
              <Box>
                <IconButton size="small" disabled={reasonOppPage <= 0} onClick={() => setReasonOppPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft />
                </IconButton>
                <IconButton size="small" disabled={reasonOppPage >= reasonOppTotalPages - 1} onClick={() => setReasonOppPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight />
                </IconButton>
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {twoByTwoTotal > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Process × Outcome (skill trajectory)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Good process can lose; bad process can win. Track whether your process is improving. ({twoByTwoTotal} with both set)
          </Typography>
          <Grid container spacing={1} sx={{ maxWidth: 360 }}>
            <Grid size={{ xs: 6 }}>
              <Box sx={{ p: 1.5, bgcolor: 'success.light', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Good process · Good outcome</Typography>
                <Typography variant="h6">{twoByTwo.goodGood}</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Box sx={{ p: 1.5, bgcolor: 'warning.light', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Good process · Bad outcome</Typography>
                <Typography variant="h6">{twoByTwo.goodBad}</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Box sx={{ p: 1.5, bgcolor: 'info.light', borderRadius: 1, textAlign: 'center', border: '2px solid', borderColor: twoByTwo.badGood > 0 ? 'warning.main' : 'transparent' }}>
                <Typography variant="caption" color="text.secondary">Bad process · Good outcome</Typography>
                <Typography variant="h6">{twoByTwo.badGood}</Typography>
                {twoByTwo.badGood > 0 && (
                  <Typography variant="caption" display="block" color="warning.dark" sx={{ mt: 0.5 }}>Dumb luck — dangerous to repeat</Typography>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Box sx={{ p: 1.5, bgcolor: 'error.light', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">Bad process · Bad outcome</Typography>
                <Typography variant="h6">{twoByTwo.badBad}</Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}

      {passedList.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Passed ideas that ran away
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            CAGR from pass date to today (no position size). See <Link component={RouterLink} to="/passed">Passed</Link> for full list.
          </Typography>
          <List dense disablePadding>
            {passedList.slice(0, 10).map((item) => {
              const hyp = passedHypothetical[item.id]
              const companyKey = normalizeTickerToCompany(item.ticker) || item.ticker.toUpperCase()
              const duration = formatDurationSince(item.passed_date)
              const cagr = hyp?.cagr
              const secondary =
                hyp === undefined
                  ? '…'
                  : cagr != null
                    ? `If you had bought (${duration} ago): ${formatCagrPercent(cagr)} CAGR`
                    : 'No chart data'
              return (
                <ListItem key={item.id} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={
                      <Link component={RouterLink} to={`/ideas/${companyKey}`} underline="hover" fontWeight={600}>
                        ${item.ticker}
                      </Link>
                    }
                    secondary={secondary}
                  />
                </ListItem>
              )
            })}
          </List>
        </Paper>
      )}

      {(() => {
        const missingPostMortem = outcomes.filter((o) => !(o.post_mortem_notes || '').trim())
        const actionIdToEntryId = new Map(actions.map((a) => [a.id, a.entry_id]))
        const actionsById = new Map(actions.map((a) => [a.id, a]))
        const withEntry = missingPostMortem
          .map((o) => ({ outcome: o, entry_id: actionIdToEntryId.get(o.action_id), ticker: getTickerForOutcome(o, actionsById) }))
          .filter((x): x is typeof x & { entry_id: string } => Boolean(x.entry_id))
        const showCount = reviewQueueExpanded ? withEntry.length : Math.min(8, withEntry.length)
        const hasMore = withEntry.length > 8 && !reviewQueueExpanded
        const overflowCount = withEntry.length - 8
        return withEntry.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Review queue: missing post-mortem
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Closed decisions without a post-mortem. Add one to learn from the outcome (F13).
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {withEntry.slice(0, showCount).map(({ outcome, entry_id, ticker }) => (
                <Chip
                  key={outcome.id}
                  label={ticker ? `$${ticker} · View entry` : 'View entry'}
                  component={RouterLink}
                  to={`/entries/${entry_id}`}
                  clickable
                  size="small"
                  variant="outlined"
                />
              ))}
              {hasMore && (
                <Chip
                  label={`+${overflowCount} more`}
                  size="small"
                  variant="outlined"
                  onClick={() => setReviewQueueExpanded(true)}
                  sx={{ cursor: 'pointer', fontWeight: 600 }}
                  clickable
                />
              )}
              {reviewQueueExpanded && withEntry.length > 8 && (
                <Chip
                  label="Show less"
                  size="small"
                  variant="outlined"
                  onClick={() => setReviewQueueExpanded(false)}
                  sx={{ cursor: 'pointer' }}
                  clickable
                />
              )}
            </Box>
          </Paper>
        ) : null
      })()}

      {errorTypeData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Error taxonomy (F21)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Weakness profile: why outcomes went wrong
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {errorTypeData.map(({ type, count }) => (
              <Chip key={type} label={`${type}: ${count}`} size="small" variant="outlined" />
            ))}
          </Box>
        </Paper>
      )}

      {(totalEntriesForPct > 0 || totalDecisionsForPct > 0) && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Daily averages
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Share of activity by weekday (%)
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="overline" color="text.secondary">Entries</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                {entryPctByDay.map(({ day, pct }) => (
                  <Typography key={day} variant="body2" component="span">
                    {day} {pct}%{day !== 'Sun' ? ' · ' : ''}
                  </Typography>
                ))}
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="overline" color="text.secondary">Decisions</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                {decisionPctByDay.map(({ day, pct }) => (
                  <Typography key={day} variant="body2" component="span">
                    {day} {pct}%{day !== 'Sun' ? ' · ' : ''}
                  </Typography>
                ))}
              </Box>
            </Grid>
          </Grid>
          {dailyData.some((d) => d.entries > 0 || d.decisions > 0) && (
            <Box sx={{ height: 220, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData} margin={{ top: 16, right: 48, left: 48, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                  <XAxis dataKey="day" tick={{ fontSize: 13, fill: '#334155' }} />
                  <YAxis yAxisId="left" domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 13 }}
                    formatter={(
                      value: number | undefined,
                      name: string | undefined,
                      item: { payload?: { day: string; entries: number; decisions: number; entryPct: number; decisionPct: number } }
                    ) => {
                      const p = item?.payload
                      if (!p) return [value, name]
                      if (name === 'Journal entries') return [`${p.entries} (${p.entryPct}% of journal entries)`, 'Journal entries']
                      if (name === 'Trades') return [`${p.decisions} (${p.decisionPct}% of trades)`, 'Trades']
                      return [value, name]
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="entries" name="Journal entries" fill={CHART_COLOR_PRIMARY} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="decisions" name="Trades" stroke={CHART_COLOR_SECONDARY} strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          )}
          <Typography variant="overline" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            Average activity per weekday (journal entries · trades)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
            {WEEKDAYS.map((day, i) => {
              const e = dailyData[i]?.entries ?? 0
              const d = dailyData[i]?.decisions ?? 0
              return (
                <Typography key={day} variant="body2" component="span" color="text.secondary">
                  {day} {e}·{d}{i < 6 ? ' · ' : ''}
                </Typography>
              )
            })}
            <Link component={RouterLink} to="/" sx={{ ml: 1, fontWeight: 600 }}>
              Start writing…
            </Link>
          </Box>
        </Paper>
      )}

      {byDateArr.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Decisions over time
          </Typography>
          <Box sx={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDateArr} margin={{ top: 16, right: 24, left: 48, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} stroke="#94a3b8" />
                <XAxis dataKey="date" tick={{ fontSize: 13, fill: '#334155' }} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 13, fill: '#334155' }} />
                <Tooltip contentStyle={{ fontSize: 13 }} />
                <Line type="monotone" dataKey="count" stroke={CHART_COLOR_PRIMARY} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {entriesCount === 0 && actionsCount === 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Add journal entries and decisions (Buy/Sell/Short etc.) to see insights and charts here.
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
