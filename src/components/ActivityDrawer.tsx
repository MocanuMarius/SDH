import { useEffect, useState } from 'react'
import {
  Drawer,
  Box,
  Typography,
  IconButton,
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
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ScheduleIcon from '@mui/icons-material/Schedule'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import RefreshIcon from '@mui/icons-material/Refresh'
import { completeReminder, createReminder } from '../services/remindersService'
import { useReminders, useActions, usePassedDueForReview, useInvalidate } from '../hooks/queries'
import { getEntry } from '../services/entriesService'
import { getOutcomesForActionIds, createOutcome } from '../services/outcomesService'
import OutcomeFormDialog from './OutcomeFormDialog'
import {
  recordPassReview,
  snoozePassReview,
} from '../services/passedService'
import { fetchChartData, type ChartData, type ChartRange } from '../services/chartApiService'
import SwipeableCard from './SwipeableCard'
import CheckIcon from '@mui/icons-material/Check'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SnoozeIcon from '@mui/icons-material/Snooze'
import type { Passed, PassReviewStatus } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import { getTickerDisplayLabel, normalizeTickerToCompany } from '../utils/tickerCompany'
import { parseOptionSymbol } from '../utils/optionSymbol'
import { getDismissedStaleIdeas, dismissStaleIdea } from '../utils/dismissedStaleIdeas'
import RelativeDate from './RelativeDate'
import type { Reminder, ActionType } from '../types/database'
import { SectionTitle, EmptyState } from './system'

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
  lastActionId: string
  entryPrice: number | null
  currentPrice: number | null
  signedAlpha: number | null
  freshnessPct: number
}

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

/** Raw price change since last action — always shows what the stock actually did. */
function computeSignedAlpha(entry: number | null, current: number | null, _type: ActionType): number | null {
  if (entry == null || current == null || entry <= 0) return null
  const raw = ((current - entry) / entry) * 100
  return Math.max(-100, Math.min(999, raw))
}

/** Annualized CAGR from a total return % and holding period in days. */
function computeCagr(totalReturnPct: number, days: number): number | null {
  if (days <= 0) return null
  const years = days / 365.25
  const multiple = 1 + totalReturnPct / 100
  if (multiple <= 0) return -100
  // For < 1 year, annualize on run-rate: (multiple ^ (1/years) - 1) * 100
  return (Math.pow(multiple, 1 / years) - 1) * 100
}

/** Card border color based on urgency */
function urgencyBorderColor(date: string): string {
  if (isOverdue(date)) return '#dc2626'   // red
  if (isDueToday(date)) return '#d97706'  // amber
  return ''  // default divider
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  // Thin wrapper around the design-system SectionTitle so the activity drawer
  // stays consistent with the rest of the app's section labels.
  return <SectionTitle count={count} mb={0.75}>{title}</SectionTitle>
}

export default function ActivityDrawer({ open, onClose, onRefresh }: ActivityDrawerProps) {
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [entryTitles, setEntryTitles] = useState<Record<string, string>>({})
  const [ideaAlerts, setIdeaAlerts] = useState<IdeaAlert[]>([])
  const [passReviews, setPassReviews] = useState<PassedWithPrice[]>([])
  const [_passReviewBusyId, setPassReviewBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [laterAnchor, setLaterAnchor] = useState<{ el: HTMLElement; reminder: Reminder } | null>(null)
  const [ideaLaterAnchor, setIdeaLaterAnchor] = useState<{ el: HTMLElement; alert: IdeaAlert } | null>(null)
  const [snoozedIdeaTickers, setSnoozedIdeaTickers] = useState<Set<string>>(new Set())
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null)
  const [resolveTarget, setResolveTarget] = useState<{ actionId: string; ticker: string } | null>(null)

  // ─── Source data via react-query — auto-refreshes after any mutation that ──
  // ─── invalidates reminders / passed / actions anywhere in the app.        ──
  const remindersQ = useReminders(true)
  const passedDueQ = usePassedDueForReview()
  const actionsQ = useActions({ limit: 2000 })

  const load = () => {
    if (!open) return
    setLoading(true)

    // Enrich passed-due-for-review with current price + return from the chart API.
    // We cap at 10 reviews per open to keep chart calls reasonable.
    const due = passedDueQ.data ?? []
    {
      const capped = due.slice(0, 10)
      Promise.all(
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
        .then((enriched) => setPassReviews(enriched))
        .catch(() => setPassReviews([]))
    }

    Promise.resolve([remindersQ.data ?? [], actionsQ.data ?? []] as const)
      .then(async ([remList, actions]) => {
        // Dedupe: same entry/ticker + same due date + same type appearing twice
        // is almost always a double-tap during creation. Keep the earliest by id
        // so "snooze" / "dismiss" land on a stable target.
        const seen = new Set<string>()
        const deduped = remList.filter((r) => {
          const key = `${r.entry_id ?? ''}|${(r.ticker ?? '').toUpperCase()}|${r.reminder_date}|${r.type}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        // Sort reminders: overdue first, then by due date ascending
        const sorted = [...deduped].sort((a, b) => a.reminder_date.localeCompare(b.reminder_date))
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

        const byTicker: Record<string, { lastDate: string; company?: string; lastType: ActionType; entryPrice: number | null; actionId: string }> = {}
        actions.forEach((a) => {
          if (!a.ticker) return
          const existing = byTicker[a.ticker]
          if (!existing || a.action_date > existing.lastDate) {
            byTicker[a.ticker] = {
              lastDate: a.action_date,
              company: a.company_name ?? undefined,
              lastType: a.type as ActionType,
              entryPrice: parseActionPrice(a.price),
              actionId: a.id,
            }
          }
        })

        // Filter out tickers whose last action already has an outcome (resolved)
        const dismissedTickers = getDismissedStaleIdeas()
        const staleActionIds = Object.values(byTicker)
          .filter(({ lastDate }) => daysAgo(lastDate) >= IDEA_REFRESH_DAYS)
          .map(({ actionId }) => actionId)
        const existingOutcomes = staleActionIds.length > 0
          ? await getOutcomesForActionIds(staleActionIds)
          : []
        const resolvedActionIds = new Set(existingOutcomes.map((o) => o.action_id))

        const baseAlerts: IdeaAlert[] = Object.entries(byTicker)
          .map(([ticker, { lastDate, company, lastType, entryPrice, actionId }]) => ({
            ticker,
            days: daysAgo(lastDate),
            company,
            lastDate,
            lastType,
            lastActionId: actionId,
            entryPrice,
            currentPrice: null,
            signedAlpha: null,
            freshnessPct: computeFreshness(daysAgo(lastDate)),
          }))
          .filter((a) => a.days >= IDEA_REFRESH_DAYS && parseOptionSymbol(a.ticker) == null && !dismissedTickers.has(a.ticker) && !resolvedActionIds.has(a.lastActionId))
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
                // Always prefer chart prices for alpha — action price may be in a different currency
                const effectiveEntry = entryFromChart ?? a.entryPrice
                const signedAlpha = computeSignedAlpha(effectiveEntry, currentPrice, a.lastType)
                return { ...a, entryPrice: effectiveEntry, currentPrice, signedAlpha }
              })
              // Sort oldest first so the longest-neglected ideas surface at the top
              return [...enriched].sort((x, y) => y.days - x.days)
            })
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Re-derive whenever the drawer opens OR the underlying react-query
    // datasets change (e.g. add a Pass elsewhere → passed-due refetches → drawer re-renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remindersQ.dataUpdatedAt, passedDueQ.dataUpdatedAt, actionsQ.dataUpdatedAt])

  const handleDismissForever = async (id: string) => {
    setDismissingId(id)
    try {
      await completeReminder(id)
      setReminders((prev) => prev.filter((r) => r.id !== id))
      invalidate.reminders()
      setDismissConfirmId(null)
      onRefresh?.()
    } finally {
      setDismissingId(null)
    }
  }

  const handleLaterSelect = async (reminder: Reminder, days: number) => {
    if (!user?.id) return
    setLaterAnchor(null)
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
      invalidate.reminders()
      onRefresh?.()
    } catch (err) {
      console.error('snooze reminder failed', err)
    }
  }

  const handleIdeaLaterSelect = async (ticker: string, days: number) => {
    if (!user?.id) return
    setIdeaLaterAnchor(null)
    try {
      await createReminder(user.id, {
        entry_id: null,
        type: 'idea_refresh',
        reminder_date: addDaysToToday(days),
        note: '',
        ticker,
      })
      setSnoozedIdeaTickers((prev) => new Set(prev).add(ticker))
      invalidate.reminders()
      onRefresh?.()
    } catch (err) {
      console.error('snooze idea failed', err)
    }
  }

  const visibleIdeaAlerts = ideaAlerts.filter((a) => !snoozedIdeaTickers.has(a.ticker))
  const isEmpty =
    !loading &&
    reminders.length === 0 &&
    visibleIdeaAlerts.length === 0 &&
    passReviews.length === 0

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
      {/* Header — serif title, hairline rule underneath. */}
      <Box sx={{ px: 2, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h4" sx={{ fontSize: '1.25rem', lineHeight: 1, m: 0 }}>
          Activity
        </Typography>
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
          <EmptyState
            icon={<NotificationsNoneIcon />}
            title="All clear"
            description="No reminders or stale tickers right now. Add a reminder from any entry to revisit it later."
            dense
          />
        ) : (
          <>
            {/* ── Pass reviews due — score your rejection ── */}
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
                              onClick={() => { onClose(); window.location.href = `/tickers/${encodeURIComponent(p.ticker)}` }}
                              sx={{ fontWeight: 700 }}
                            />
                            <Typography variant="caption" color={retColor} fontWeight={700}>
                              {retLabel}
                            </Typography>
                          </Box>
                          {p.reason && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontStyle: 'italic' }}>
                              {p.reason}
                            </Typography>
                          )}
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
                <Stack spacing={0.75}>
                  {reminders.map((r) => {
                    const overdue = isOverdue(r.reminder_date)
                    const dueToday = isDueToday(r.reminder_date)
                    const borderColor = urgencyBorderColor(r.reminder_date)
                    const navTo = r.entry_id ? `/entries/${r.entry_id}` : r.ticker ? `/tickers/${encodeURIComponent(normalizeTickerToCompany(r.ticker) || r.ticker)}` : null
                    return (
                      <SwipeableCard
                        key={r.id}
                        actions={[
                          ...(navTo ? [{ icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />, label: 'Open', onClick: () => { onClose(); window.location.href = navTo }, color: '#2563eb' }] : []),
                          { icon: <ScheduleIcon sx={{ fontSize: 18 }} />, label: '+7d', onClick: () => handleLaterSelect(r, 7), color: '#475569' },
                          { icon: <CloseIcon sx={{ fontSize: 18 }} />, label: 'Dismiss', onClick: () => setDismissConfirmId(r.id), color: '#dc2626' },
                        ]}
                        sx={{
                          borderLeft: borderColor ? `3px solid ${borderColor}` : '3px solid transparent',
                          bgcolor: overdue ? 'rgba(220,38,38,0.04)' : dueToday ? 'rgba(217,119,6,0.04)' : 'background.paper',
                        }}
                      >
                        <Box sx={{ px: 1.25, py: 1, display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
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
                                <Chip size="small" label={getTickerDisplayLabel(r.ticker)} sx={{ fontWeight: 700, height: 20 }} />
                              </Box>
                            ) : (
                              <Typography variant="body2" fontWeight={600}>Reminder</Typography>
                            )}
                            <Typography
                              variant="caption"
                              color={overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary'}
                              fontWeight={overdue || dueToday ? 600 : 400}
                              display="block"
                            >
                              <RelativeDate date={r.reminder_date} /> · {typeLabel(r.type)}
                            </Typography>
                            {r.note?.trim() && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                sx={{ fontSize: '0.7rem', fontStyle: 'italic', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                "{r.note.trim()}"
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </SwipeableCard>
                    )
                  })}
                </Stack>
              </Box>
            )}

            {reminders.length > 0 && visibleIdeaAlerts.length > 0 && (
              <Divider sx={{ my: 1.5 }} />
            )}

            {/* ── Ideas to refresh ── */}
            {visibleIdeaAlerts.length > 0 && (
              <Box>
                <SectionHeader title={`Stale tickers · ${IDEA_REFRESH_DAYS}+ days`} count={visibleIdeaAlerts.length} />
                <Stack spacing={0.75}>
                  {visibleIdeaAlerts.map((a) => {
                    const realReturn = a.signedAlpha
                    const cagr = realReturn != null ? computeCagr(realReturn, a.days) : null
                    const realColor = realReturn == null ? '#64748b' : realReturn >= 0 ? '#16a34a' : '#dc2626'
                    const cagrColor = cagr == null ? '#64748b' : cagr >= 0 ? '#16a34a' : '#dc2626'
                    const ideaUrl = `/tickers/${encodeURIComponent(normalizeTickerToCompany(a.ticker) || a.ticker)}`
                    return (
                      <SwipeableCard
                        key={a.ticker}
                        actions={[
                          { icon: <CheckIcon sx={{ fontSize: 18 }} />, label: 'Resolve', onClick: () => setResolveTarget({ actionId: a.lastActionId, ticker: a.ticker }), color: '#16a34a' },
                          { icon: <LightbulbOutlinedIcon sx={{ fontSize: 18 }} />, label: 'View', onClick: () => { onClose(); window.location.href = ideaUrl }, color: '#2563eb' },
                          { icon: <SnoozeIcon sx={{ fontSize: 18 }} />, label: '+30d', onClick: () => handleIdeaLaterSelect(a.ticker, 30), color: '#475569' },
                          { icon: <CloseIcon sx={{ fontSize: 18 }} />, label: 'Drop', onClick: () => { dismissStaleIdea(a.ticker); setIdeaAlerts((prev) => prev.filter((x) => x.ticker !== a.ticker)) }, color: '#dc2626' },
                        ]}
                      >
                        <Box sx={{ px: 1.25, py: 0.75, display: 'flex', gap: 0.75 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Chip size="small" label={getTickerDisplayLabel(a.ticker)} clickable onClick={() => { onClose(); window.location.href = `/tickers/${encodeURIComponent(a.ticker)}` }} sx={{ fontWeight: 700, height: 22 }} />
                              {a.company && (
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160, flex: 1 }}>
                                  {a.company}
                                </Typography>
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                              Last entry <RelativeDate date={a.lastDate} />
                            </Typography>
                          </Box>
                          {/* Right-aligned return columns */}
                          {realReturn != null && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 80 }}>
                              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>(Real)</Typography>
                                <Typography variant="caption" fontWeight={700} sx={{ color: realColor, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                  {realReturn >= 0 ? '+' : ''}{realReturn.toFixed(1)}%
                                </Typography>
                              </Box>
                              {cagr != null && (
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem' }}>(CAGR)</Typography>
                                  <Typography variant="caption" fontWeight={600} sx={{ color: cagrColor, fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                    {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}%
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      </SwipeableCard>
                    )
                  })}
                </Stack>
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

      {/* Outcome resolution dialog for stale ideas */}
      {resolveTarget && (
        <OutcomeFormDialog
          open
          onClose={() => setResolveTarget(null)}
          initial={null}
          actionLabel={getTickerDisplayLabel(resolveTarget.ticker)}
          onSubmit={async (data) => {
            await createOutcome({
              action_id: resolveTarget.actionId,
              realized_pnl: data.realized_pnl,
              outcome_date: data.outcome_date,
              notes: data.notes,
              driver: data.driver,
              post_mortem_notes: data.post_mortem_notes || null,
              process_quality: data.process_quality ?? null,
              outcome_quality: data.outcome_quality ?? null,
              process_score: data.process_score,
              outcome_score: data.outcome_score,
              closing_memo: data.closing_memo?.trim() || null,
              error_type: data.error_type ?? null,
              what_i_remember_now: data.what_i_remember_now?.trim() || null,
            })
            setIdeaAlerts((prev) => prev.filter((x) => x.ticker !== resolveTarget.ticker))
            setResolveTarget(null)
          }}
        />
      )}
    </Drawer>
  )
}

export function useActivityBadge(): { count: number; refresh: () => void } {
  // Reads from the shared react-query cache, so any invalidate.reminders()
  // call anywhere in the app re-counts the badge automatically.
  const remindersQ = useReminders(true)
  const today = new Date().toISOString().slice(0, 10)
  const count = (remindersQ.data ?? []).filter((r) => r.reminder_date <= today).length
  const refresh = () => { void remindersQ.refetch() }
  return { count, refresh }
}
