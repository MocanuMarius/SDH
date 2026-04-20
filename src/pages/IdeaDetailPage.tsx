import { useEffect, useState, useMemo, Fragment } from 'react'
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Link,
  Stack,
} from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ValuationWidget from '../components/ValuationWidget'
import { type ActionWithEntry } from '../services/actionsService'
import { fetchChartData } from '../services/chartApiService'
import { useActions, useInvalidate } from '../hooks/queries'
import { useAuth } from '../contexts/AuthContext'
import { useSnackbar } from '../contexts/SnackbarContext'
import { createAction } from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import InlineDecisionBar from '../components/InlineDecisionBar'
import TickerLinks from '../components/TickerLinks'
import TickerTimelineChart from '../components/TickerTimelineChart'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from '../components/OptionTypeChip'
import { PageHeader, StatusChip, statusFromLatestActionType, EmptyState } from '../components/system'
import { relativeBucket, formatDayHeader } from '../utils/relativeBucket'
import {
  computeCagrFromChart,
  formatCagrPercent,
  formatDurationSince,
  getPctChangeBetween,
  formatDeltaPercent,
} from '../utils/cagr'
import type { ChartRange } from '../services/chartApiService'
import { todayISO } from '../utils/dates'

/** Whole calendar days between two ISO dates (rounded). */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.round(ms / 86400000)
}

/** Format an elapsed-days count into a compact human label (e.g. "47d", "3.2y"). */
function formatElapsed(days: number): string {
  if (days < 60) return `${days}d`
  if (days < 365 * 2) return `${(days / 30).toFixed(1)}mo`
  return `${(days / 365).toFixed(1)}y`
}

/** Pick the best chart range to show all decisions with padding before first and after last */
function bestRangeForActions(actions: ActionWithEntry[]): ChartRange {
  if (actions.length === 0) return '1y'
  const dates = actions.map((a) => a.action_date).sort()
  const firstMs = new Date(dates[0]).getTime()
  const todayMs = Date.now()
  const spanDays = (todayMs - firstMs) / (1000 * 60 * 60 * 24)
  // Add ~20% padding before first decision
  const totalDays = spanDays * 1.2 + 60
  if (totalDays <= 35) return '1m'
  if (totalDays <= 100) return '3m'
  if (totalDays <= 200) return '6m'
  if (totalDays <= 400) return '1y'
  if (totalDays <= 800) return '2y'
  if (totalDays <= 1200) return '3y'
  if (totalDays <= 2000) return '5y'
  return 'max'
}

export default function IdeaDetailPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const chartHeight = isMobile ? 240 : 320
  const [chartData, setChartData] = useState<{ dates: string[]; prices: number[] } | null>(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The old logDecisionOpen / editingAction modal state is gone — both
  // flows now navigate to /decisions/new (with ?ticker= prefill) or
  // /decisions/:id/edit instead of opening an ActionFormDialog.
  const [counterfactual, setCounterfactual] = useState<{
    totalReturnPct: number | null
    hypotheticalEnd: number | null
    cagr: number | null
    loading: boolean
  }>({ totalReturnPct: null, hypotheticalEnd: null, cagr: null, loading: false })

  // ─── react-query: shared actions cache, auto-refreshes everywhere ──
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const { showSuccess } = useSnackbar()
  const allActionsQ = useActions({ limit: 500 })
  const loading = allActionsQ.isLoading
  const queryError = allActionsQ.error ? (allActionsQ.error as Error).message : null
  const actions: ActionWithEntry[] = useMemo(() => {
    if (!ticker) return []
    const companyKey = normalizeTickerToCompany(decodeURIComponent(ticker))
    if (!companyKey) return []
    return (allActionsQ.data ?? []).filter(
      (a) => normalizeTickerToCompany(a.ticker) === companyKey,
    )
  }, [allActionsQ.data, ticker])
  const errorMessage = error ?? queryError ?? (ticker && !loading && !normalizeTickerToCompany(decodeURIComponent(ticker)) ? `Invalid ticker: ${ticker}` : null)

  const passActions = useMemo(() => actions.filter((a) => a.type === 'pass'), [actions])
  const firstPassDate = useMemo(
    () => passActions.length > 0
      ? passActions.reduce((min, a) => (a.action_date < min ? a.action_date : min), passActions[0].action_date)
      : null,
    [passActions]
  )

  const autoRange = useMemo(() => bestRangeForActions(actions), [actions])

  useEffect(() => {
    if (!ticker || actions.length === 0) {
      setChartData(null)
      setChartLoading(false)
      setCounterfactual((c) => ({ ...c, loading: false }))
      return
    }
    let cancelled = false
    setChartLoading(true)
    setChartError(null)
    setCounterfactual((c) => ({ ...c, loading: true }))
    fetchChartData(decodeURIComponent(ticker), autoRange)
      .then((chart) => {
        if (cancelled) return
        setChartData({ dates: chart.dates, prices: chart.prices })
        if (firstPassDate) {
          const cagr = computeCagrFromChart(chart.dates, chart.prices, firstPassDate)
          setCounterfactual({ totalReturnPct: null, hypotheticalEnd: null, cagr, loading: false })
        } else {
          setCounterfactual((c) => ({ ...c, loading: false }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChartData(null)
          setChartError('Chart data unavailable — deltas and counterfactual P&L cannot be calculated.')
          setCounterfactual((c) => ({ ...c, loading: false }))
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false)
      })
    return () => { cancelled = true }
    // `actions.length` is intentionally not a dep: we only want to refetch the
    // chart when the ticker or the time range changes, not every time the
    // actions array re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, firstPassDate, autoRange])

  // Hooks must be called in the same order every render — compute actionDeltas
  // BEFORE any early returns. A null ticker simply yields an empty map.
  const actionDeltas = useMemo(() => {
    if (!ticker) return {} as Record<string, number | null>
    if (!chartData?.dates?.length || !chartData?.prices?.length) return {} as Record<string, number | null>
    const sorted = [...actions].sort((a, b) => (a.action_date || '').localeCompare(b.action_date || ''))
    const out: Record<string, number | null> = {}
    for (let i = 0; i < sorted.length; i++) {
      const action = sorted[i]
      const toDate = i < sorted.length - 1 ? sorted[i + 1].action_date : null
      out[action.id] = getPctChangeBetween(
        chartData.dates,
        chartData.prices,
        action.action_date || '',
        toDate
      )
    }
    return out
  }, [chartData, actions, ticker])

  if (!ticker) {
    return (
      <Alert severity="info">No ticker selected. Go to Tickers and click one.</Alert>
    )
  }

  const company = actions[0]?.company_name ?? ''
  const decodedTicker = decodeURIComponent(ticker)

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  if (errorMessage) {
    return (
      <Box>
        <Alert severity="error" onClose={() => setError(null)}>{errorMessage}</Alert>
        <Button component={RouterLink} to="/tickers" sx={{ mt: 2 }}>Back to Tickers</Button>
      </Box>
    )
  }

  const latestAction = actions.length > 0
    ? [...actions].sort((a, b) => (b.action_date || '').localeCompare(a.action_date || ''))[0]
    : null

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Sticky header via the shared PageHeader — matches every other
          full page (Timeline, Journal, Tickers). On mobile it sticks
          under the AppBar so the user always knows which ticker they're
          looking at while they scroll through decisions. Eyebrow carries
          the "Tickers /" breadcrumb bit the old ad-hoc block provided. */}
      <PageHeader
        eyebrow={
          <Link component={RouterLink} to="/tickers" underline="hover" color="inherit">
            Tickers
          </Link>
        }
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
            <Box component="span">${decodedTicker}</Box>
            {company && (
              <Box component="span" sx={{ fontWeight: 400, fontSize: '0.55em', color: 'text.secondary' }}>
                {company}
              </Box>
            )}
          </Box>
        }
        actions={latestAction ? <StatusChip kind={statusFromLatestActionType(latestAction.type)} /> : undefined}
        dense
      />

      {/* Inline log-decision bar — newspaper-tape strip that lets the user
          log a decision without opening a modal. Pre-fills the ticker, uses
          the latest known price as the default. The "+ details" icon opens
          the full ActionFormDialog for date/notes/kill-criteria editing. */}
      <InlineDecisionBar
        ticker={decodedTicker}
        companyName={company}
        currentPrice={chartData?.prices?.[chartData.prices.length - 1] ?? null}
        onLog={async ({ type, reason, size, price, currency }) => {
          if (!user?.id) return
          await createAction({
            user_id: user.id,
            entry_id: null,
            type,
            ticker: decodedTicker.toUpperCase(),
            company_name: company || null,
            action_date: todayISO(),
            price,
            currency: currency || null,
            shares: null,
            reason,
            notes: '',
            kill_criteria: null,
            pre_mortem_text: null,
            size,
            raw_snippet: null,
          })
          if (type === 'pass') {
            await ensurePassedForUser(user.id, decodedTicker, {
              passed_date: todayISO(),
              reason,
              notes: '',
            })
            invalidate.passed()
          }
          invalidate.actions()
          showSuccess('Decision logged')
        }}
        onWantDetails={() => navigate(`/decisions/new?ticker=${encodeURIComponent(decodedTicker)}`)}
      />
      {actions.length > 0 && (() => {
        const sortedAsc = [...actions].sort((a, b) => (a.action_date || '').localeCompare(b.action_date || ''))
        const first = sortedAsc[0].action_date
        const last = sortedAsc[sortedAsc.length - 1].action_date
        const span = first && last && first !== last ? formatElapsed(daysBetween(first, last)) : null
        return (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {actions.length} decision{actions.length === 1 ? '' : 's'}{span ? ` over ${span}` : ''}
            {first && (
              <>
                {' · first '}
                <RelativeDate date={first} variant="caption" sx={{ color: 'inherit' }} />
              </>
            )}
            {last && first !== last && (
              <>
                {' · last '}
                <RelativeDate date={last} variant="caption" sx={{ color: 'inherit' }} />
              </>
            )}
          </Typography>
        )
      })()}
      {passActions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Counterfactual: since you passed
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span" display="block" sx={{ mb: 0.5 }}>
            You passed on {passActions.length === 1 ? (
              <RelativeDate date={passActions[0].action_date} variant="body2" sx={{ color: 'inherit' }} />
            ) : (
              passActions.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <RelativeDate date={a.action_date} variant="body2" sx={{ color: 'inherit' }} />
                </span>
              ))
            )}. Chart below shows how ${decodedTicker} performed since then.
          </Typography>
          {counterfactual.loading && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CircularProgress size={14} /> Computing impact…
            </Typography>
          )}
          {!counterfactual.loading && counterfactual.cagr != null && firstPassDate && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              If you had bought ({formatDurationSince(firstPassDate)} ago), you would have had{' '}
              <Box component="span" sx={{ color: counterfactual.cagr >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                {formatCagrPercent(counterfactual.cagr)} CAGR
              </Box>
              .
            </Typography>
          )}
          {!counterfactual.loading && counterfactual.cagr == null && firstPassDate && (
            <Typography variant="body2" color="text.secondary">
              Could not compute hypothetical return (chart data may not cover the pass date).
            </Typography>
          )}
          {passActions.some((a) => a.reason?.trim()) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
              Your reason: <TickerLinks text={passActions.find((a) => a.reason?.trim())?.reason ?? ''} variant="chip" dense />
            </Typography>
          )}
        </Paper>
      )}

      <Box sx={{ width: '100%', overflow: 'hidden', mb: 1 }}>
        <TickerTimelineChart symbol={decodedTicker} actions={actions} companyName={company} height={chartHeight} defaultRange={autoRange} />
      </Box>

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Link
          component={RouterLink}
          to={`/timeline?symbol=${encodeURIComponent(decodedTicker)}`}
          variant="body2"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
        >
          <TimelineIcon sx={{ fontSize: 18 }} />
          See in full timeline — zoom, benchmark, overlay other tickers
        </Link>
      </Box>

      {chartError && (
        <Alert severity="warning" sx={{ mb: 2 }}>{chartError}</Alert>
      )}

      {/* Valuation widget — per-ticker, uses the first entry's data */}
      {actions[0]?.entry?.id && <ValuationWidget entryId={actions[0].entry.id} hideWhenEmpty />}

      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Decisions ({actions.length})
      </Typography>
      {actions.length === 0 ? (
        <EmptyState
          dense
          icon={<TimelineIcon />}
          title={`No decisions on $${(ticker ?? '').toUpperCase()} yet`}
        />
      ) : (() => {
        // Newest-first ordering: top row = most recent decision.
        // Each row's "between" pill describes the price change FROM the next-older
        // decision shown right below it INTO that row's decision date.
        const sortedActions = [...actions].sort((a, b) => (b.action_date || '').localeCompare(a.action_date || ''))

        // Group actions by action_date so we can render newspaper-style
        // section headers before each day. One ticker usually has one
        // decision per day — the header still adds value by carrying the
        // coarse "how long ago" bucket the user scans first.
        const dateGroups: { date: string; items: ActionWithEntry[] }[] = []
        for (const a of sortedActions) {
          const key = (a.action_date || '').slice(0, 10) || 'unknown'
          const last = dateGroups[dateGroups.length - 1]
          if (last && last.date === key) last.items.push(a)
          else dateGroups.push({ date: key, items: [a] })
        }

        const renderBetween = (newer: ActionWithEntry, older: ActionWithEntry | 'now') => {
          // Delta is precomputed chronologically from older.id → newer's date.
          // For the "to today" pill above the newest row, use the newest action's own delta
          // (older='now' means the newer action IS the most recent and we look forward to today).
          const sourceId = older === 'now' ? newer.id : older.id
          const delta = actionDeltas[sourceId]
          if (delta == null || !Number.isFinite(delta)) return null
          const days = older === 'now'
            ? daysBetween(newer.action_date || '', todayISO())
            : daysBetween(older.action_date || '', newer.action_date || '')
          if (!Number.isFinite(days) || days < 0) return null
          const arrow = delta >= 0 ? '▲' : '▼'
          const color = delta >= 0 ? 'success.main' : 'error.main'
          const label = older === 'now' ? `over the last ${formatElapsed(days)} (to today)` : `over ${formatElapsed(days)}`
          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.5,
                borderLeft: 3,
                borderColor: color,
                bgcolor: 'grey.50',
                borderRadius: 0.5,
              }}
            >
              <Typography variant="caption" fontWeight={700} sx={{ color }}>
                {arrow} {formatDeltaPercent(delta)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Box>
          )
        }

        // Newspaper-style section opener — same visual grammar as the
        // Timeline page's DecisionsInRange headers. Sticky within the
        // scrolling parent so the user always knows which day they're on.
        const renderDateHeader = (date: string) => (
          <Box
            sx={{
              position: 'sticky',
              top: { xs: 104, sm: 0 },
              zIndex: 1,
              bgcolor: 'background.default',
              borderTop: 1,
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
                fontSize: '0.9rem',
              }}
            >
              {relativeBucket(date)}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 'auto' }}
            >
              {formatDayHeader(date)}
            </Typography>
          </Box>
        )

        // Track flat action index across groups so between-pill logic stays
        // intact when iterating group-by-group.
        let flatIdx = 0

        return isMobile ? (
          /* Mobile: section-grouped card layout. Each date group owns a
             sticky header; the between-pill still lands between the
             decision it transitioned FROM and the newer one ABOVE it. */
          <Stack spacing={0.5}>
            {dateGroups.map(({ date, items }) => {
              const groupCards = items.map((a) => {
                const myIdx = flatIdx++
                const older = sortedActions[myIdx + 1]
                const topPill = myIdx === 0 && !chartLoading ? renderBetween(a, 'now') : null
                const between = !chartLoading && older ? renderBetween(a, older) : null
                return (
                  <Fragment key={a.id}>
                    {topPill}
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mb: 0.5 }}>
                        <DecisionChip type={a.type} size="small" />
                        <OptionTypeChip ticker={a.ticker} />
                        {a.price && (
                          <Typography variant="body2" fontWeight={600}>
                            {a.price}{a.currency ? ` ${a.currency}` : ''}
                          </Typography>
                        )}
                        {/* Edit pencil — opens ActionFormDialog in edit mode. */}
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/decisions/${a.id}/edit`)}
                          aria-label="Edit decision"
                          sx={{ p: 0.25, color: 'text.secondary', ml: 'auto' }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      {a.reason && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          <TickerLinks text={a.reason} variant="chip" dense />
                        </Typography>
                      )}
                      {a.entry && (
                        <Button
                          component={RouterLink}
                          to={`/entries/${a.entry.id}`}
                          size="small"
                          sx={{ textTransform: 'none', px: 0, fontSize: '0.75rem' }}
                        >
                          {getEntryDisplayTitle(a.entry, [a]).slice(0, 50)}
                          {getEntryDisplayTitle(a.entry, [a]).length > 50 ? '…' : ''}
                        </Button>
                      )}
                    </Paper>
                    {between}
                  </Fragment>
                )
              })
              return (
                <Box key={date}>
                  {renderDateHeader(date)}
                  <Stack spacing={1} sx={{ mt: 0.75, mb: 0.5 }}>
                    {groupCards}
                  </Stack>
                </Box>
              )
            })}
          </Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 520 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Ticker</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Entry</TableCell>
                  <TableCell sx={{ width: 36 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {dateGroups.map(({ date, items }) => (
                  <Fragment key={date}>
                    {/* Section header row — full-width date subhead.
                        Serif primary (bucket) + tiny right-aligned exact
                        date. colSpan=6 matches the column count below. */}
                    <TableRow>
                      <TableCell colSpan={6} sx={{ bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider', py: 0.5, px: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
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
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 'auto' }}
                          >
                            {formatDayHeader(date)}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                    {items.map((a) => {
                      const myIdx = flatIdx++
                      const older = sortedActions[myIdx + 1]
                      const topPill = myIdx === 0 && !chartLoading ? renderBetween(a, 'now') : null
                      const between = !chartLoading && older ? renderBetween(a, older) : null
                      return (
                        <Fragment key={a.id}>
                          {topPill && (
                            <TableRow sx={{ '& td': { borderBottom: 'none', py: 0 } }}>
                              <TableCell colSpan={6} sx={{ p: 0, pt: 0.5, pb: 0.5, px: 1 }}>
                                {topPill}
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell><DecisionChip type={a.type} size="small" /></TableCell>
                            <TableCell>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                {a.ticker ? getTickerDisplayLabel(a.ticker) || `$${a.ticker}` : '—'}
                                <OptionTypeChip ticker={a.ticker} />
                              </Box>
                            </TableCell>
                            <TableCell>
                              {a.price}
                              {a.currency ? ` ${a.currency}` : ''}
                            </TableCell>
                            <TableCell>{a.reason ? <TickerLinks text={a.reason} variant="chip" dense /> : '—'}</TableCell>
                            <TableCell>
                              {a.entry ? (
                                <Button
                                  component={RouterLink}
                                  to={`/entries/${a.entry.id}`}
                                  size="small"
                                  sx={{ textTransform: 'none' }}
                                >
                                  {getEntryDisplayTitle(a.entry, [a]).slice(0, 40)}
                                  {getEntryDisplayTitle(a.entry, [a]).length > 40 ? '…' : ''}
                                </Button>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell sx={{ p: 0.5 }}>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/decisions/${a.id}/edit`)}
                                aria-label="Edit decision"
                                sx={{ color: 'text.secondary' }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                          {between && (
                            <TableRow sx={{ '& td': { borderBottom: 'none', py: 0 } }}>
                              <TableCell colSpan={6} sx={{ p: 0, pt: 0.25, pb: 0.5, px: 1 }}>
                                {between}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      })()}

      {/* The bottom-of-page ActionFormDialog mount is gone. Both the
          "log decision with details" flow (from InlineDecisionBar's
          gear) and the "edit decision" flow (✏️ icons on rows) now
          navigate to DecisionFormPage routes — see the navigate()
          calls above. The page-level form handles createAction /
          updateAction itself, so all the wiring that used to live
          here is gone too. */}
    </Box>
  )
}
