import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  Button,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Skeleton,
  Stack,
  Tooltip,
  LinearProgress,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ScheduleIcon from '@mui/icons-material/Schedule'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import RefreshIcon from '@mui/icons-material/Refresh'
import { listReminders, completeReminder, createReminder } from '../services/remindersService'
import { listActions } from '../services/actionsService'
import { getEntry, listEntries } from '../services/entriesService'
import { listOutcomes } from '../services/outcomesService'
import { isAutomatedEntry } from '../utils/entryTitle'
import {
  listPassedDueForReview,
  recordPassReview,
  snoozePassReview,
} from '../services/passedService'
import { fetchChartData, type ChartData, type ChartRange } from '../services/chartApiService'
import { detectLosingPeriod, type LosingPeriodResult } from '../utils/losingPeriodDetector'
import SwipeableCard from './SwipeableCard'
import CheckIcon from '@mui/icons-material/Check'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SnoozeIcon from '@mui/icons-material/Snooze'
import type { Passed, PassReviewStatus } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import { useTickerChart } from '../contexts/TickerChartContext'
import TickerLinks from './TickerLinks'
import { getTickerDisplayLabel, normalizeTickerToCompany } from '../utils/tickerCompany'
import OptionTypeChip from './OptionTypeChip'
import RelativeDate from './RelativeDate'
import type { Reminder, ActionType } from '../types/database'

function addDaysToToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const IDEA_REFRESH_DAYS = 90
const TODAY = new Date().toISOString().slice(0, 10)

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
}

function isOverdue(reminderDate: string): boolean {
  return reminderDate < TODAY
}

function isDueToday(reminderDate: string): boolean {
  return reminderDate === TODAY
}

function typeIcon(type: Reminder['type']) {
  if (type === 'entry_review') return <ArticleOutlinedIcon fontSize="small" />
  if (type === 'idea_refresh') return <LightbulbOutlinedIcon fontSize="small" />
  return <FlagOutlinedIcon fontSize="small" />
}

function typeLabel(type: Reminder['type']) {
  if (type === 'entry_review') return 'Review'
  if (type === 'idea_refresh') return 'Revisit idea'
  return 'Prediction ended'
}

interface ActivityDrawerProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const LATER_INTERVALS: { label: string; days: number }[] = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
]

/**
 * A passed idea that's due for retrospective review, enriched with the entry
 * price (what it was when passed) and the current price so the user can see
 * at a glance whether their pass looks right or wrong.
 */
type PassedWithPrice = Passed & {
  entryPrice: number | null
  currentPrice: number | null
  /** Percent change from passed_date to today. Null if we couldn't look up a price. */
  returnSincePass: number | null
}

type IdeaAlert = {
  ticker: string
  days: number
  company?: string
  lastDate: string
  lastType: ActionType
  entryPrice: number | null
  currentPrice: number | null
  /** Signed return since last action, direction-adjusted by action type. Positive = decision aging well. */
  signedAlpha: number | null
  /** 0–100, decays linearly over one year. */
  freshnessPct: number
}

/** Actions where you expect the price to go UP to be validated. */
const BULLISH_TYPES: ActionType[] = ['buy', 'add_more', 'speculate', 'cover']
/** Actions where you expect the price to go DOWN (or stay flat) to be validated. */
const BEARISH_TYPES: ActionType[] = ['sell', 'trim', 'short', 'pass']

function parseActionPrice(price: string | null | undefined): number | null {
  if (price == null || typeof price !== 'string') return null
  const cleaned = price.replace(/,/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Pick the smallest chart range that covers the given lookback window. */
function rangeForDays(days: number): ChartRange {
  if (days <= 30) return '3m'
  if (days <= 90) return '6m'
  if (days <= 330) return '1y'
  if (days <= 700) return '2y'
  if (days <= 1800) return '5y'
  return 'max'
}

/** Find the chart close on (or just before) the given date. */
function findPriceAtDate(data: ChartData | null | undefined, targetDate: string): number | null {
  if (!data?.dates?.length || !data?.prices?.length) return null
  // Find the last index where dates[i] <= targetDate
  let matchIdx = -1
  for (let i = 0; i < data.dates.length; i++) {
    if (data.dates[i] <= targetDate) matchIdx = i
    else break
  }
  if (matchIdx === -1) return data.prices[0] ?? null
  const p = data.prices[matchIdx]
  return Number.isFinite(p) ? p : null
}

function computeFreshness(days: number): number {
  return Math.max(0, Math.min(100, 100 - (days / 365) * 100))
}

function computeSignedAlpha(entry: number | null, current: number | null, type: ActionType): number | null {
  if (entry == null || current == null || entry <= 0) return null
  const pct = ((current - entry) / entry) * 100
  if (BULLISH_TYPES.includes(type)) return pct
  if (BEARISH_TYPES.includes(type)) return -pct
  return pct // neutral: hold/research/watchlist — displayed without sign coloring
}

function isNeutralType(type: ActionType): boolean {
  return !BULLISH_TYPES.includes(type) && !BEARISH_TYPES.includes(type)
}

function freshnessColor(pct: number): string {
  if (pct >= 75) return '#16a34a'  // green: 0–90 days
  if (pct >= 50) return '#d97706'  // amber: 90–180 days
  if (pct >= 25) return '#ea580c'  // orange: 180–273 days
  return '#dc2626'                 // red: 273+ days
}

/** Human-friendly label for the expected direction of each action type. */
function directionLabel(type: ActionType): string {
  if (type === 'pass') return 'Since pass'
  if (type === 'buy' || type === 'add_more' || type === 'speculate') return 'Since buy'
  if (type === 'sell' || type === 'trim') return 'Since sell'
  if (type === 'short') return 'Since short'
  if (type === 'cover') return 'Since cover'
  if (type === 'hold') return 'Since hold'
  return `Since ${type}`
}

/** Card border color based on urgency */
function urgencyBorderColor(date: string): string {
  if (isOverdue(date)) return '#dc2626'   // red
  if (isDueToday(date)) return '#d97706'  // amber
  return ''  // default divider
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em' }}>
        {title}
      </Typography>
      <Chip label={count} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
    </Box>
  )
}

export default function ActivityDrawer({ open, onClose, onRefresh }: ActivityDrawerProps) {
  const { user } = useAuth()
  const { openChart } = useTickerChart()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [entryTitles, setEntryTitles] = useState<Record<string, string>>({})
  const [ideaAlerts, setIdeaAlerts] = useState<IdeaAlert[]>([])
  const [passReviews, setPassReviews] = useState<PassedWithPrice[]>([])
  const [_passReviewBusyId, setPassReviewBusyId] = useState<string | null>(null)
  const [losingPeriod, setLosingPeriod] = useState<LosingPeriodResult | null>(null)
  const [losingPeriodDismissed, setLosingPeriodDismissed] = useState(false)
  const [losingEntryId, setLosingEntryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [laterAnchor, setLaterAnchor] = useState<{ el: HTMLElement; reminder: Reminder } | null>(null)
  const [ideaLaterAnchor, setIdeaLaterAnchor] = useState<{ el: HTMLElement; alert: IdeaAlert } | null>(null)
  const [snoozedIdeaTickers, setSnoozedIdeaTickers] = useState<Set<string>>(new Set())
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null)
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [snoozingIdeaTicker, setSnoozingIdeaTicker] = useState<string | null>(null)

  const load = () => {
    if (!open) return
    setLoading(true)
    // Detect losing-period from MANUAL outcomes only (exclude automated IBKR).
    Promise.all([listOutcomes(), listActions({ limit: 2000 }), listEntries()])
      .then(([outcomes, actions, entries]) => {
        // Build set of automated entry IDs to filter out
        const autoIds = new Set(entries.filter(isAutomatedEntry).map((e) => e.id))
        const actionEntryMap = new Map(actions.map((a) => [a.id, a.entry_id]))
        const manualOutcomes = outcomes.filter((o) => {
          const entryId = actionEntryMap.get(o.action_id)
          return entryId != null && !autoIds.has(entryId)
        })
        const lp = detectLosingPeriod(
          manualOutcomes.map((o) => ({
            action_id: o.action_id,
            outcome_date: o.outcome_date,
            realized_pnl: o.realized_pnl,
          })),
        )
        setLosingPeriod(lp)
        // Find the entry_id associated with the most recent loser so the nudge
        // can deep-link directly to its post-mortem fields.
        if (lp.mostRecentLoserActionId) {
          const a = actions.find((x) => x.id === lp.mostRecentLoserActionId)
          setLosingEntryId(a?.entry_id ?? null)
        } else {
          setLosingEntryId(null)
        }
      })
      .catch(() => {
        setLosingPeriod(null)
        setLosingEntryId(null)
      })

    // Fire passed-review fetch in parallel with the main data load. It's a
    // small table (<100 rows typically), doesn't block the main skeleton.
    listPassedDueForReview()
      .then((due) => {
        // Enrich each with entry + current price from the chart API.
        // We cap at 10 reviews per open to keep chart calls reasonable.
        const capped = due.slice(0, 10)
        return Promise.all(
          capped.map((p) =>
            fetchChartData(p.ticker, '1y')
              .then((data): PassedWithPrice => {
                const entryPrice = findPriceAtDate(data, p.passed_date)
                const currentPrice = data?.prices?.[data.prices.length - 1] ?? null
                const returnSincePass =
                  entryPrice != null && currentPrice != null && entryPrice > 0
                    ? ((currentPrice - entryPrice) / entryPrice) * 100
                    : null
                return { ...p, entryPrice, currentPrice, returnSincePass }
              })
              .catch((): PassedWithPrice => ({ ...p, entryPrice: null, currentPrice: null, returnSincePass: null })),
          ),
        )
      })
      .then((enriched) => setPassReviews(enriched))
      .catch(() => setPassReviews([]))

    Promise.all([listReminders(true), listActions({ limit: 2000 })])
      .then(([remList, actions]) => {
        // Sort reminders: overdue first, then by due date ascending
        const sorted = [...remList].sort((a, b) => a.reminder_date.localeCompare(b.reminder_date))
        setReminders(sorted)

        const entryIds = [...new Set(sorted.filter((r) => r.entry_id).map((r) => r.entry_id!))]
        Promise.all(entryIds.map((id) => getEntry(id)))
          .then((entries) => {
            const map: Record<string, string> = {}
            entries.forEach((e, i) => {
              if (e && entryIds[i]) {
                // Strip leading markdown heading markers for clean display
                const raw = (e.title_markdown || e.date || 'Entry').replace(/^#+\s*/, '').trim()
                map[entryIds[i]] = raw.slice(0, 80)
              }
            })
            setEntryTitles(map)
          })
          .catch(() => {})

        const byTicker: Record<string, { lastDate: string; company?: string; lastType: ActionType; entryPrice: number | null }> = {}
        actions.forEach((a) => {
          if (!a.ticker) return
          const existing = byTicker[a.ticker]
          if (!existing || a.action_date > existing.lastDate) {
            byTicker[a.ticker] = {
              lastDate: a.action_date,
              company: a.company_name ?? undefined,
              lastType: a.type as ActionType,
              entryPrice: parseActionPrice(a.price),
            }
          }
        })
        const baseAlerts: IdeaAlert[] = Object.entries(byTicker)
          .map(([ticker, { lastDate, company, lastType, entryPrice }]) => ({
            ticker,
            days: daysAgo(lastDate),
            company,
            lastDate,
            lastType,
            entryPrice,
            currentPrice: null,
            signedAlpha: null,
            freshnessPct: computeFreshness(daysAgo(lastDate)),
          }))
          .filter((a) => a.days >= IDEA_REFRESH_DAYS)
          .sort((a, b) => b.days - a.days)
          .slice(0, 20)
        setIdeaAlerts(baseAlerts)

        // Fire parallel chart fetches to compute current price + derive entry
        // price at action date. For pass decisions (which rarely have a
        // recorded price), we look up the close nearest to lastDate from the
        // chart data itself.
        if (baseAlerts.length > 0) {
          Promise.all(
            baseAlerts.map((alert) => {
              const range = rangeForDays(alert.days)
              return fetchChartData(alert.ticker, range)
                .then((data) => {
                  const lastPrice = data?.prices?.[data.prices.length - 1] ?? null
                  const entryFromChart = findPriceAtDate(data, alert.lastDate)
                  return {
                    ticker: alert.ticker,
                    currentPrice: lastPrice,
                    entryFromChart,
                  }
                })
                .catch(() => ({ ticker: alert.ticker, currentPrice: null as number | null, entryFromChart: null as number | null }))
            })
          ).then((results) => {
            const priceMap: Record<string, { currentPrice: number | null; entryFromChart: number | null }> = {}
            results.forEach(({ ticker, currentPrice, entryFromChart }) => {
              priceMap[ticker] = {
                currentPrice: currentPrice != null && Number.isFinite(currentPrice) ? currentPrice : null,
                entryFromChart: entryFromChart != null && Number.isFinite(entryFromChart) ? entryFromChart : null,
              }
            })
            setIdeaAlerts((prev) => {
              const enriched = prev.map((a) => {
                const { currentPrice, entryFromChart } = priceMap[a.ticker] ?? { currentPrice: null, entryFromChart: null }
                const effectiveEntry = a.entryPrice ?? entryFromChart
                const signedAlpha = computeSignedAlpha(effectiveEntry, currentPrice, a.lastType)
                return { ...a, entryPrice: effectiveEntry, currentPrice, signedAlpha }
              })
              // Re-sort: worst alpha first (big missed rallies on passes, big losses on buys)
              // Entries with no alpha fall to the bottom.
              return [...enriched].sort((x, y) => {
                if (x.signedAlpha == null && y.signedAlpha == null) return y.days - x.days
                if (x.signedAlpha == null) return 1
                if (y.signedAlpha == null) return -1
                return x.signedAlpha - y.signedAlpha
              })
            })
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) setLosingPeriodDismissed(false)
    load()
    // Intentionally only re-load on drawer open/close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleDismissForever = async (id: string) => {
    setDismissingId(id)
    try {
      await completeReminder(id)
      setReminders((prev) => prev.filter((r) => r.id !== id))
      setDismissConfirmId(null)
      onRefresh?.()
    } finally {
      setDismissingId(null)
    }
  }

  const handleLaterSelect = async (reminder: Reminder, days: number) => {
    if (!user?.id) return
    setLaterAnchor(null)
    setSnoozingId(reminder.id)
    try {
      await completeReminder(reminder.id)
      const created = await createReminder(user.id, {
        entry_id: reminder.entry_id ?? null,
        type: reminder.type,
        reminder_date: addDaysToToday(days),
        note: reminder.note ?? '',
        ticker: reminder.ticker ?? '',
      })
      setReminders((prev) =>
        [...prev.filter((r) => r.id !== reminder.id), created].sort((a, b) =>
          a.reminder_date.localeCompare(b.reminder_date)
        )
      )
      onRefresh?.()
    } finally {
      setSnoozingId(null)
    }
  }

  const handleIdeaLaterSelect = async (ticker: string, days: number) => {
    if (!user?.id) return
    setIdeaLaterAnchor(null)
    setSnoozingIdeaTicker(ticker)
    try {
      await createReminder(user.id, {
        entry_id: null,
        type: 'idea_refresh',
        reminder_date: addDaysToToday(days),
        note: '',
        ticker,
      })
      setSnoozedIdeaTickers((prev) => new Set(prev).add(ticker))
      onRefresh?.()
    } finally {
      setSnoozingIdeaTicker(null)
    }
  }

  const visibleIdeaAlerts = ideaAlerts.filter((a) => !snoozedIdeaTickers.has(a.ticker))
  const showLosingNudge =
    !losingPeriodDismissed && losingPeriod != null && losingPeriod.inLosingPeriod
  const isEmpty =
    !loading &&
    reminders.length === 0 &&
    visibleIdeaAlerts.length === 0 &&
    passReviews.length === 0 &&
    !showLosingNudge

  const handlePassReview = async (id: string, status: PassReviewStatus) => {
    setPassReviewBusyId(id)
    try {
      await recordPassReview(id, status)
      setPassReviews((prev) => prev.filter((p) => p.id !== id))
      onRefresh?.()
    } finally {
      setPassReviewBusyId(null)
    }
  }

  const handlePassSnooze = async (id: string) => {
    setPassReviewBusyId(id)
    try {
      await snoozePassReview(id, 30)
      setPassReviews((prev) => prev.filter((p) => p.id !== id))
      onRefresh?.()
    } finally {
      setPassReviewBusyId(null)
    }
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, display: 'flex', flexDirection: 'column' } }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotificationsNoneIcon fontSize="small" color="action" />
          <Typography variant="h6" fontWeight={700} fontSize="1rem">
            Activity
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ overflow: 'auto', flex: 1, p: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        ) : isEmpty ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <NotificationsNoneIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              All clear — no reminders or stale ideas.
            </Typography>
            <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
              Add a reminder from any entry to revisit it later.
            </Typography>
          </Box>
        ) : (
          <>
            {/* ── Losing-period nudge (R6/R12 — review when it hurts most) ── */}
            {showLosingNudge && losingPeriod && (
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  border: '1px solid',
                  borderColor: '#d97706',
                  borderLeft: '4px solid #d97706',
                  borderRadius: 1,
                  bgcolor: 'rgba(217,119,6,0.06)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                  <FlagOutlinedIcon fontSize="small" sx={{ color: '#d97706', mt: '2px', flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ color: '#78350f' }}>
                      You're in a losing streak
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {losingPeriod.trigger === 'consecutive'
                        ? `${losingPeriod.consecutiveLosses} consecutive losing closes.`
                        : `Cumulative P&L down ${losingPeriod.drawdownPct.toFixed(1)}% from peak.`}
                      {' '}This is when deep review has the most value — not when you avoid it.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      {losingEntryId && (
                        <Button
                          size="small"
                          variant="contained"
                          color="warning"
                          component={RouterLink}
                          to={`/entries/${losingEntryId}`}
                          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                          onClick={onClose}
                        >
                          Review most recent loser
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setLosingPeriodDismissed(true)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'text.secondary' }}
                      >
                        Dismiss for now
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── Pass reviews due (R10 — score your rejection) ── */}
            {passReviews.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Score your rejection" count={passReviews.length} />
                <Stack spacing={0.75}>
                  {passReviews.map((p) => {
                    const ret = p.returnSincePass
                    const retColor = ret == null ? 'text.disabled' : ret > 5 ? '#dc2626' : ret < -5 ? '#16a34a' : 'text.secondary'
                    const retLabel = ret == null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`
                    return (
                      <SwipeableCard
                        key={p.id}
                        actions={[
                          { icon: <CheckIcon sx={{ fontSize: 18 }} />, label: 'Correct', onClick: () => handlePassReview(p.id, 'correct'), color: '#16a34a' },
                          { icon: <ThumbDownIcon sx={{ fontSize: 18 }} />, label: 'Missed', onClick: () => handlePassReview(p.id, 'should_have_bought'), color: '#dc2626' },
                          { icon: <HelpOutlineIcon sx={{ fontSize: 18 }} />, label: '???', onClick: () => handlePassReview(p.id, 'inconclusive'), color: '#64748b' },
                          { icon: <SnoozeIcon sx={{ fontSize: 18 }} />, label: '+30d', onClick: () => handlePassSnooze(p.id), color: '#475569' },
                        ]}
                        actionWidth={56}
                        sx={{ borderLeft: '3px solid #6366f1', bgcolor: 'rgba(99,102,241,0.04)' }}
                      >
                        <Box sx={{ p: 1.25 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <Chip
                              size="small"
                              label={getTickerDisplayLabel(p.ticker)}
                              clickable
                              onClick={() => openChart(p.ticker)}
                              sx={{ fontWeight: 700 }}
                            />
                            <Typography variant="caption" color={retColor} fontWeight={700}>
                              {retLabel}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Passed <RelativeDate date={p.passed_date} sx={{ color: 'inherit' }} />
                            {p.entryPrice != null && ` · $${p.entryPrice.toFixed(2)}`}
                            {p.currentPrice != null && ` → $${p.currentPrice.toFixed(2)}`}
                          </Typography>
                        </Box>
                      </SwipeableCard>
                    )
                  })}
                </Stack>
              </Box>
            )}

            {/* ── Reminders ── */}
            {reminders.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Reminders" count={reminders.length} />
                <List dense disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {reminders.map((r) => {
                    const overdue = isOverdue(r.reminder_date)
                    const dueToday = isDueToday(r.reminder_date)
                    const borderColor = urgencyBorderColor(r.reminder_date)
                    return (
                      <ListItem
                        key={r.id}
                        disablePadding
                        sx={{
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          border: '1px solid',
                          borderColor: borderColor || 'divider',
                          borderLeft: borderColor ? `3px solid ${borderColor}` : '3px solid transparent',
                          borderRadius: 1,
                          p: 1.25,
                          bgcolor: overdue ? 'rgba(220,38,38,0.04)' : dueToday ? 'rgba(217,119,6,0.04)' : 'background.paper',
                        }}
                      >
                        {/* Title row */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.5 }}>
                          <Box sx={{ color: overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary', mt: '2px', flexShrink: 0 }}>
                            {typeIcon(r.type)}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {r.entry_id ? (
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {entryTitles[r.entry_id] ?? 'Entry'}
                              </Typography>
                            ) : r.ticker ? (
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip size="small" label={getTickerDisplayLabel(r.ticker)} clickable onClick={() => openChart(r.ticker!)} sx={{ fontWeight: 700 }} />
                                <OptionTypeChip ticker={r.ticker} />
                              </Box>
                            ) : (
                              <Typography variant="body2" fontWeight={600}>Reminder</Typography>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                              <Typography
                                variant="caption"
                                color={overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary'}
                                fontWeight={overdue || dueToday ? 600 : 400}
                              >
                                <RelativeDate date={r.reminder_date} />
                              </Typography>
                              <Typography variant="caption" color="text.disabled">·</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {typeLabel(r.type)}
                              </Typography>
                            </Box>
                            {r.note && (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, lineHeight: 1.4 }}>
                                <TickerLinks text={r.note} variant="link" dense />
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Actions row */}
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                          {r.entry_id ? (
                            <Button size="small" variant="outlined" component={RouterLink} to={`/entries/${r.entry_id}`} onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                              Open entry
                            </Button>
                          ) : r.ticker ? (
                            <Button size="small" variant="outlined" component={RouterLink} to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(r.ticker) || r.ticker)}`} onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                              View idea
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            startIcon={<ScheduleIcon sx={{ fontSize: '0.85rem !important' }} />}
                            disabled={snoozingId === r.id}
                            onClick={(e) => setLaterAnchor({ el: e.currentTarget, reminder: r })}
                            sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'text.secondary' }}
                          >
                            {snoozingId === r.id ? '…' : 'Snooze'}
                          </Button>
                          <Tooltip title="Dismiss forever">
                            <IconButton
                              size="small"
                              aria-label="Dismiss forever"
                              disabled={dismissingId === r.id}
                              onClick={() => setDismissConfirmId(r.id)}
                              sx={{ color: 'text.disabled', ml: 'auto' }}
                            >
                              <CloseIcon sx={{ fontSize: '0.9rem' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </ListItem>
                    )
                  })}
                </List>
              </Box>
            )}

            {reminders.length > 0 && visibleIdeaAlerts.length > 0 && (
              <Divider sx={{ my: 1.5 }} />
            )}

            {/* ── Ideas to refresh ── */}
            {visibleIdeaAlerts.length > 0 && (
              <Box>
                <SectionHeader title={`Stale ideas · ${IDEA_REFRESH_DAYS}+ days`} count={visibleIdeaAlerts.length} />
                <List dense disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {visibleIdeaAlerts.map((a) => {
                    const neutral = isNeutralType(a.lastType)
                    const alphaPositive = a.signedAlpha != null && a.signedAlpha > 0
                    const alphaColor = neutral
                      ? '#64748b'
                      : alphaPositive
                        ? '#16a34a'
                        : '#dc2626'
                    // Magnitude bar: saturate at ±100% so typical moves have
                    // visual gradient. Extreme moves (>100%) still max out.
                    const alphaMagnitude =
                      a.signedAlpha != null ? Math.min(100, Math.abs(a.signedAlpha)) : 0
                    const freshColor = freshnessColor(a.freshnessPct)
                    return (
                      <ListItem
                        key={a.ticker}
                        disablePadding
                        sx={{
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          p: 1,
                          flexDirection: 'column',
                          alignItems: 'stretch',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <LightbulbOutlinedIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Chip size="small" label={getTickerDisplayLabel(a.ticker)} clickable onClick={() => openChart(a.ticker)} sx={{ fontWeight: 700 }} />
                              <OptionTypeChip ticker={a.ticker} />
                              {a.company && (
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
                                  {a.company}
                                </Typography>
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Last: <RelativeDate date={a.lastDate} />
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                            <Button
                              size="small"
                              disabled={snoozingIdeaTicker === a.ticker}
                              onClick={(e) => setIdeaLaterAnchor({ el: e.currentTarget, alert: a })}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                            >
                              {snoozingIdeaTicker === a.ticker ? '…' : 'Snooze'}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              component={RouterLink}
                              to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(a.ticker) || a.ticker)}`}
                              onClick={onClose}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                            >
                              View
                            </Button>
                          </Box>
                        </Box>

                        {/* Meters */}
                        <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {/* Freshness meter */}
                          <Tooltip title={`Conviction freshness · ${a.days} days since last action`} placement="top" arrow>
                            <Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Freshness
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600, color: freshColor }}>
                                  {a.freshnessPct.toFixed(0)}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={a.freshnessPct}
                                sx={{
                                  height: 4,
                                  borderRadius: 2,
                                  bgcolor: 'action.hover',
                                  '& .MuiLinearProgress-bar': { bgcolor: freshColor, borderRadius: 2 },
                                }}
                              />
                            </Box>
                          </Tooltip>

                          {/* Alpha-decay meter */}
                          <Tooltip
                            title={
                              a.signedAlpha == null
                                ? a.entryPrice == null
                                  ? 'No entry price recorded — can’t compute alpha'
                                  : 'Fetching current price…'
                                : neutral
                                  ? `${a.signedAlpha >= 0 ? '+' : ''}${a.signedAlpha.toFixed(1)}% since ${a.lastType} (neutral action)`
                                  : alphaPositive
                                    ? `Aging well: ${a.signedAlpha >= 0 ? '+' : ''}${a.signedAlpha.toFixed(1)}% in your favor since ${a.lastType}`
                                    : `Aging poorly: ${a.signedAlpha.toFixed(1)}% against you since ${a.lastType}`
                            }
                            placement="top"
                            arrow
                          >
                            <Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {directionLabel(a.lastType)}
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600, color: a.signedAlpha == null ? 'text.disabled' : alphaColor }}>
                                  {a.signedAlpha == null
                                    ? a.entryPrice == null
                                      ? '—'
                                      : '…'
                                    : `${a.signedAlpha >= 0 ? '+' : ''}${a.signedAlpha.toFixed(1)}%`}
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={alphaMagnitude}
                                sx={{
                                  height: 4,
                                  borderRadius: 2,
                                  bgcolor: 'action.hover',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: a.signedAlpha == null ? 'action.disabled' : alphaColor,
                                    borderRadius: 2,
                                  },
                                }}
                              />
                            </Box>
                          </Tooltip>
                        </Box>
                      </ListItem>
                    )
                  })}
                </List>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Snooze menus */}
      <Menu anchorEl={laterAnchor?.el} open={Boolean(laterAnchor)} onClose={() => setLaterAnchor(null)}>
        {LATER_INTERVALS.map(({ label, days }) => (
          <MenuItem key={days} dense onClick={() => laterAnchor && handleLaterSelect(laterAnchor.reminder, days)}>
            Remind in {label}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={ideaLaterAnchor?.el} open={Boolean(ideaLaterAnchor)} onClose={() => setIdeaLaterAnchor(null)}>
        {LATER_INTERVALS.map(({ label, days }) => (
          <MenuItem key={days} dense onClick={() => ideaLaterAnchor && handleIdeaLaterSelect(ideaLaterAnchor.alert.ticker, days)}>
            Remind in {label}
          </MenuItem>
        ))}
      </Menu>

      {/* Dismiss confirm */}
      <Dialog open={Boolean(dismissConfirmId)} onClose={() => setDismissConfirmId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Dismiss reminder?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You won&apos;t be reminded again. You can add a new reminder from the entry if needed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDismissConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => dismissConfirmId && handleDismissForever(dismissConfirmId)}
            disabled={dismissingId === dismissConfirmId}
          >
            {dismissingId === dismissConfirmId ? '…' : 'Dismiss'}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  )
}

export function useActivityBadge(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0)
  const refresh = () => {
    listReminders(true).then((reminders) => {
      const today = new Date().toISOString().slice(0, 10)
      const due = reminders.filter((r) => r.reminder_date <= today).length
      setCount(due)
    }).catch(() => {})
  }
  useEffect(() => { refresh() }, [])
  return { count, refresh }
}
