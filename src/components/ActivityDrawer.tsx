/**
 * Reminders drawer — was "Activity". Scope deliberately narrowed per user
 * direction: surface PAST-DUE reminders and upcoming reminders, drop the
 * auto-generated "ticker N weeks ago" stale-idea list that lived here
 * before. Pass reviews ("score your rejection") stay because they are
 * explicit, actionable prompts keyed to specific decisions — not stale
 * activity noise.
 */

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
import { useReminders, usePassedDueForReview, useInvalidate } from '../hooks/queries'
import { getEntry } from '../services/entriesService'
import {
  recordPassReview,
  snoozePassReview,
} from '../services/passedService'
import { fetchChartData, type ChartData } from '../services/chartApiService'
import SwipeableCard from './SwipeableCard'
import CheckIcon from '@mui/icons-material/Check'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SnoozeIcon from '@mui/icons-material/Snooze'
import type { Passed, PassReviewStatus } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import { getTickerDisplayLabel, normalizeTickerToCompany } from '../utils/tickerCompany'
import RelativeDate from './RelativeDate'
import type { Reminder } from '../types/database'
import { SectionTitle, EmptyState } from './system'

function addDaysToToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = new Date().toISOString().slice(0, 10)

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

interface RemindersDrawerProps {
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

/** Find the chart close on (or just before) the given date. */
function findPriceAtDate(data: ChartData | null | undefined, targetDate: string): number | null {
  if (!data?.dates?.length || !data?.prices?.length) return null
  let matchIdx = -1
  for (let i = 0; i < data.dates.length; i++) {
    if (data.dates[i] <= targetDate) matchIdx = i
    else break
  }
  if (matchIdx === -1) return data.prices[0] ?? null
  const p = data.prices[matchIdx]
  return Number.isFinite(p) ? p : null
}

/** Card border color based on urgency */
function urgencyBorderColor(date: string): string {
  if (isOverdue(date)) return '#dc2626'   // red
  if (isDueToday(date)) return '#d97706'  // amber
  return ''  // default divider
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  // Thin wrapper around the design-system SectionTitle so the reminders
  // drawer stays consistent with the rest of the app's section labels.
  return <SectionTitle count={count} mb={0.75}>{title}</SectionTitle>
}

/**
 * One reminder row. Extracted from the main component so Past-due and
 * Upcoming sections share rendering without duplicating 60+ lines of JSX.
 * Swipe-left reveals Open (if we know where to go) / +7d / Dismiss.
 */
function renderReminderCard(
  r: Reminder,
  handlers: {
    onOpenNav: () => void
    onSnoozeWeek: () => void
    onDismiss: () => void
    entryTitles: Record<string, string>
  },
) {
  const overdue = isOverdue(r.reminder_date)
  const dueToday = isDueToday(r.reminder_date)
  const borderColor = urgencyBorderColor(r.reminder_date)
  const navTo = r.entry_id
    ? `/entries/${r.entry_id}`
    : r.ticker
      ? `/tickers/${encodeURIComponent(normalizeTickerToCompany(r.ticker) || r.ticker)}`
      : null
  return (
    <SwipeableCard
      key={r.id}
      actions={[
        ...(navTo
          ? [{
              icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
              label: 'Open',
              onClick: () => { handlers.onOpenNav(); window.location.href = navTo },
              color: '#2563eb',
            }]
          : []),
        { icon: <ScheduleIcon sx={{ fontSize: 18 }} />, label: '+7d', onClick: handlers.onSnoozeWeek, color: '#475569' },
        { icon: <CloseIcon sx={{ fontSize: 18 }} />, label: 'Dismiss', onClick: handlers.onDismiss, color: '#dc2626' },
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
              {handlers.entryTitles[r.entry_id] ?? 'Entry'}
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
}

export default function ActivityDrawer({ open, onClose, onRefresh }: RemindersDrawerProps) {
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [entryTitles, setEntryTitles] = useState<Record<string, string>>({})
  const [passReviews, setPassReviews] = useState<PassedWithPrice[]>([])
  const [_passReviewBusyId, setPassReviewBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [laterAnchor, setLaterAnchor] = useState<{ el: HTMLElement; reminder: Reminder } | null>(null)
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null)

  // ─── Source data via react-query — auto-refreshes after any mutation that ──
  // ─── invalidates reminders / passed anywhere in the app.                  ──
  const remindersQ = useReminders(true)
  const passedDueQ = usePassedDueForReview()

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

    Promise.resolve(remindersQ.data ?? [])
      .then((remList) => {
        // Dedupe: same entry/ticker + same due date + same type appearing
        // twice is almost always a double-tap during creation. Keep the
        // earliest by id so "snooze" / "dismiss" land on a stable target.
        const seen = new Set<string>()
        const deduped = remList.filter((r) => {
          const key = `${r.entry_id ?? ''}|${(r.ticker ?? '').toUpperCase()}|${r.reminder_date}|${r.type}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        // Past-due first (ascending by date so oldest-overdue rises to the
        // top); then today / upcoming by date. The rendering groups split
        // these for visual emphasis.
        const sorted = [...deduped].sort((a, b) => a.reminder_date.localeCompare(b.reminder_date))
        setReminders(sorted)

        const entryIds = [...new Set(sorted.filter((r) => r.entry_id).map((r) => r.entry_id!))]
        Promise.all(entryIds.map((id) => getEntry(id)))
          .then((entries) => {
            const map: Record<string, string> = {}
            entries.forEach((e, i) => {
              if (e && entryIds[i]) {
                const raw = (e.title_markdown || e.date || 'Entry').replace(/^#+\s*/, '').trim()
                map[entryIds[i]] = raw.slice(0, 80)
              }
            })
            setEntryTitles(map)
          })
          .catch(() => {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // Re-derive whenever the drawer opens OR the underlying react-query
    // datasets change (e.g. add a Pass elsewhere → passed-due refetches → drawer re-renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remindersQ.dataUpdatedAt, passedDueQ.dataUpdatedAt])

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

  // Partition reminders by urgency for the rendering below. Past-due is the
  // headline section (the user explicitly asked us to surface these rather
  // than the "N weeks ago" stale-ticker noise that used to share this drawer).
  const pastDue = reminders.filter((r) => isOverdue(r.reminder_date))
  const upcoming = reminders.filter((r) => !isOverdue(r.reminder_date))

  const isEmpty =
    !loading &&
    reminders.length === 0 &&
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
          Reminders
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

            {/* ── Past due — headline group, red left rule, pink tint ── */}
            {pastDue.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Past due" count={pastDue.length} />
                <Stack spacing={0.75}>
                  {pastDue.map((r) => renderReminderCard(r, {
                    onOpenNav: onClose,
                    onSnoozeWeek: () => handleLaterSelect(r, 7),
                    onDismiss: () => setDismissConfirmId(r.id),
                    entryTitles,
                  }))}
                </Stack>
              </Box>
            )}

            {/* ── Upcoming (today + future) — secondary group ── */}
            {upcoming.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <SectionHeader title="Upcoming" count={upcoming.length} />
                <Stack spacing={0.75}>
                  {upcoming.map((r) => renderReminderCard(r, {
                    onOpenNav: onClose,
                    onSnoozeWeek: () => handleLaterSelect(r, 7),
                    onDismiss: () => setDismissConfirmId(r.id),
                    entryTitles,
                  }))}
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
  // Reads from the shared react-query cache, so any invalidate.reminders()
  // call anywhere in the app re-counts the badge automatically.
  const remindersQ = useReminders(true)
  const today = new Date().toISOString().slice(0, 10)
  const count = (remindersQ.data ?? []).filter((r) => r.reminder_date <= today).length
  const refresh = () => { void remindersQ.refetch() }
  return { count, refresh }
}
