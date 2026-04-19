import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Typography, Alert, Stack, Skeleton, Paper, Link, useMediaQuery, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, InputAdornment } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import { useTheme } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { deleteEntry, updateEntry } from '../services/entriesService'
import { createReminder, deleteReminder } from '../services/remindersService'
import { fetchChartData } from '../services/chartApiService'
import { useAuth } from '../contexts/AuthContext'
import {
  createAction,
  deleteAction,
  updateAction,
} from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import {
  createOutcome,
  updateOutcome,
} from '../services/outcomesService'
import {
  createPrediction,
  updatePrediction,
  deletePrediction,
} from '../services/predictionsService'
import {
  useEntry,
  useActionsByEntry,
  useOutcomesByActionIds,
  usePredictions,
  useReminders,
  useInvalidate,
} from '../hooks/queries'
import { ListCard, ItemRow, EmptyState, AddPlusButton, PageHeader } from '../components/system'
import TickerDollarField from '../components/TickerDollarField'
import TimelineIcon from '@mui/icons-material/Timeline'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import ActionFormDialog from '../components/ActionFormDialog'
import OutcomeFormDialog from '../components/OutcomeFormDialog'
import PredictionFormDialog from '../components/PredictionFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import DecisionCard from '../components/DecisionCard'
import ValuationWidget from '../components/ValuationWidget'
import PredictionCard from '../components/PredictionCard'
import PlainTextWithTickers from '../components/PlainTextWithTickers'
import AddReminderDialog from '../components/AddReminderDialog'
import TagChip from '../components/TagChip'
import { useSnackbar } from '../contexts/SnackbarContext'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import { getTickerDisplayLabel } from '../utils/tickerCompany'
import type { Outcome, Action } from '../types/database'
import type { EntryPrediction } from '../types/database'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showSuccess } = useSnackbar()
  const muiTheme = useTheme()
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'))

  // ─── Server data via react-query (auto-refreshes after mutations elsewhere) ───
  const entryQ = useEntry(id)
  const actionsQ = useActionsByEntry(id)
  // Stable reference for downstream useMemos.
  const actions = useMemo(() => actionsQ.data ?? [], [actionsQ.data])
  const outcomesQ = useOutcomesByActionIds(actions.map((a) => a.id))
  const outcomesByActionId = useMemo(() => {
    const map: Record<string, Outcome> = {}
    ;(outcomesQ.data ?? []).forEach((o) => { map[o.action_id] = o })
    return map
  }, [outcomesQ.data])
  const predictionsQ = usePredictions(id)
  const predictions = predictionsQ.data ?? []
  const remindersQ = useReminders(true)
  const entryReminders = useMemo(
    () => (remindersQ.data ?? []).filter((r) => r.entry_id === id),
    [remindersQ.data, id]
  )

  const entry = entryQ.data ?? null
  const loading = entryQ.isLoading
  const error = entryQ.error?.message ?? null
  const invalidate = useInvalidate()
  const [detailTab, setDetailTab] = useState(0)
  const [quickNote, setQuickNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  // Holds the action being edited; null means the dialog is in "add new" mode.
  const [editingAction, setEditingAction] = useState<Action | null>(null)
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [outcomeDialogActionId, setOutcomeDialogActionId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'action'; id: string }
    | { type: 'entry' }
    | { type: 'prediction'; id: string }
    | null
  >(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [predictionDialogOpen, setPredictionDialogOpen] = useState(false)
  const [editingPrediction, setEditingPrediction] = useState<EntryPrediction | null>(null)
  const [currentPriceByTicker, setCurrentPriceByTicker] = useState<Record<string, number>>({})

  const openActionTickers = useMemo(() => {
    const withOutcome = new Set(Object.keys(outcomesByActionId))
    return Array.from(
      new Set(
        actions
          .filter((a) => !withOutcome.has(a.id) && (a.type === 'buy' || a.type === 'add_more') && a.ticker?.trim())
          .map((a) => (a.ticker || '').trim().toUpperCase())
      )
    ).filter(Boolean)
  }, [actions, outcomesByActionId])
  // Stable string key — primitive dep for the price-fetch useEffect below.
  const openActionTickersKey = openActionTickers.join(',')

  useEffect(() => {
    if (openActionTickers.length === 0) return
    let cancelled = false
    openActionTickers.forEach((ticker) => {
      fetchChartData(ticker, '3m')
        .then((data) => {
          if (cancelled || !data?.prices?.length) return
          const last = data.prices[data.prices.length - 1]
          if (last != null && Number.isFinite(last)) {
            setCurrentPriceByTicker((prev) => ({ ...prev, [ticker]: last }))
          }
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openActionTickersKey])

  const handleAddNote = async () => {
    if (!quickNote.trim() || !id || !entry) return
    setSavingNote(true)
    try {
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
      const noteBlock = `\n\n> **Note ${date}:** ${quickNote.trim()}`
      const updated = (entry.body_markdown || '') + noteBlock
      await updateEntry(id, { body_markdown: updated })
      invalidate.entries()
      setQuickNote('')
      showSuccess('Note added')
    } catch {
      // silently fail
    } finally {
      setSavingNote(false)
    }
  }

  const handleDeleteReminder = async (reminderId: string) => {
    try {
      await deleteReminder(reminderId)
      invalidate.reminders()
    } catch (err) {
      console.error('delete reminder failed', err)
    }
  }

  if (loading || !id) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rectangular" height={36} width="60%" />
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={80} />
      </Stack>
    )
  }
  if (error || !entry) {
    return (
      <Box>
        <Alert severity="error">{error ?? 'Entry not found'}</Alert>
        <Button component={RouterLink} to="/" sx={{ mt: 2 }}>
          Back to journal
        </Button>
      </Box>
    )
  }

  const hasOutcomes = actions.some((a) => outcomesByActionId[a.id])

  // Mobile collapses Edit / Remind / Delete into a MoreVert overflow so
  // the sticky title strip stays visually tight. Desktop still shows the
  // primary actions inline. Same actions, two presentations.
  const mobileActions = (
    <>
      <IconButton
        size="small"
        aria-label="Entry actions"
        onClick={(e) => setOverflowAnchor(e.currentTarget)}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={overflowAnchor}
        open={Boolean(overflowAnchor)}
        onClose={() => setOverflowAnchor(null)}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <MenuItem
          onClick={() => {
            setOverflowAnchor(null)
            setReminderDialogOpen(true)
          }}
        >
          <ListItemIcon>
            <NotificationsActiveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add reminder</ListItemText>
        </MenuItem>
        <MenuItem
          component={RouterLink}
          to={`/entries/${entry.id}/edit`}
          onClick={() => setOverflowAnchor(null)}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOverflowAnchor(null)
            setConfirmDelete({ type: 'entry' })
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete entry</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )

  return (
    <Box>
      {/* Sticky PageHeader brings Entry detail in line with Timeline /
          Per-ticker: on mobile the title strip sticks under the AppBar
          so the user always knows which entry they're reading. The
          eyebrow carries the "Journal /" breadcrumb bit the ad-hoc
          Breadcrumbs block used to. */}
      <PageHeader
        eyebrow={
          <Link component={RouterLink} to="/" underline="hover" color="inherit">
            Journal
          </Link>
        }
        title={<PlainTextWithTickers source={getEntryDisplayTitle(entry, actions)} inline dense />}
        actions={
          isMobile ? (
            mobileActions
          ) : (
            <>
              <Button
                component={RouterLink}
                to={`/entries/${entry.id}/edit`}
                variant="contained"
                size="small"
                startIcon={<EditIcon />}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<NotificationsActiveIcon />}
                onClick={() => setReminderDialogOpen(true)}
              >
                Remind me
              </Button>
              <IconButton
                aria-label="Delete entry"
                onClick={() => setConfirmDelete({ type: 'entry' })}
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'rgba(185,28,28,0.06)' } }}
                size="small"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </>
          )
        }
        dense
      />
      {hasOutcomes && (
        <Alert severity="info" sx={{ mb: 2 }} icon={false}>
          <Typography variant="body2">
            <strong>This entry has recorded outcomes.</strong> Edits will change the historical record — consider adding a follow-up entry instead.
          </Typography>
        </Alert>
      )}
      {entry.tags.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mb: 2 }}>
          {entry.tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </Box>
      )}
      {entry.body_markdown.trim() && (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.5, sm: 2 },
            mb: 2,
            borderLeft: 4,
            borderLeftColor: 'primary.light',
            bgcolor: 'background.paper',
            '& p:first-of-type': { mt: 0 },
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            maxWidth: '100%',
          }}
        >
          <PlainTextWithTickers source={entry.body_markdown} dense />
        </Paper>
      )}

      {/* Quick note — append a timestamped note without editing the full entry.
          Multi-line auto-grow; Cmd/Ctrl+Enter or Enter (no shift) submits.
          Uses TickerDollarField so typing $ pops the same ticker autocomplete
          you get in the entry title and body. The dropdown's own Enter handler
          (when open) preventDefaults, so Enter-to-submit only fires when
          autocomplete is closed — no conflict. */}
      <TickerDollarField
        size="small"
        placeholder="Add a note… ($ for tickers)"
        value={quickNote}
        onChange={setQuickNote}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            // Don't fire if defaultPrevented — TickerDollarField may have
            // captured Enter to select an autocomplete result.
            if (e.defaultPrevented) return
            e.preventDefault()
            handleAddNote()
          }
        }}
        disabled={savingNote}
        fullWidth
        multiline
        minRows={1}
        maxRows={8}
        sx={{ mt: 1.5, '& .MuiInputBase-root': { fontSize: '0.85rem', alignItems: 'flex-end' } }}
        InputProps={{
          endAdornment: quickNote.trim() ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleAddNote} disabled={savingNote} edge="end">
                <SendIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {/* Decision Context — each field renders as its own ListCard so the
          detail view uses the same visual vocabulary as the edit form and
          the Reminders section. Only shows cards for fields that have a
          value; the whole block is skipped if every field is empty. */}
      {(() => {
        // Parse trading_plan once into entry/exit rule lists.
        const splitRules = (s: string) => s.split(/\s*\n\s*|\s*;\s*|\s*·\s*/).map((r) => r.trim()).filter(Boolean)
        const lines = (entry.trading_plan || '').split('\n')
        const entryRulesDisp = splitRules(lines.find((l) => l.startsWith('Entry:'))?.replace('Entry:', '').trim() ?? '')
        const exitRulesDisp = splitRules(lines.find((l) => l.startsWith('Exit:'))?.replace('Exit:', '').trim() ?? '')
        const hasAny = entry.market_feeling != null || entry.market_context || entry.decision_horizon || entryRulesDisp.length > 0 || exitRulesDisp.length > 0
        if (!hasAny) return null
        const sentimentLabel = (v: number) =>
          v <= -7 ? 'Extreme Fear' : v <= -3 ? 'Fear' : v <= -1 ? 'Mild Fear' : v === 0 ? 'Neutral' : v <= 2 ? 'Mild Optimism' : v <= 6 ? 'Optimistic' : 'Extreme Greed'
        return (
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {entry.market_feeling != null && (
              <ListCard title="Market Sentiment" hasValue>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ color: entry.market_feeling > 0 ? 'success.main' : entry.market_feeling < 0 ? 'error.main' : 'text.secondary' }}
                >
                  {entry.market_feeling > 0 ? '+' : ''}{entry.market_feeling}
                  <Typography component="span" variant="body2" color="text.secondary" fontWeight={500} sx={{ ml: 0.75 }}>
                    · {sentimentLabel(entry.market_feeling)}
                  </Typography>
                </Typography>
              </ListCard>
            )}
            {entry.market_context && (
              <ListCard title="Market Conditions" hasValue>
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  {entry.market_context.split(',').map((cond) => {
                    const trimmed = cond.trim()
                    return trimmed ? <Chip key={trimmed} label={trimmed} size="small" variant="outlined" /> : null
                  })}
                </Box>
              </ListCard>
            )}
            {entry.decision_horizon && (
              <ListCard title="Expected Resolution" hasValue>
                <Typography variant="body2">{entry.decision_horizon}</Typography>
              </ListCard>
            )}
            {entryRulesDisp.length > 0 && (
              <ListCard title="Entry Rules" count={entryRulesDisp.length} hasValue>
                {entryRulesDisp.map((r, i) => (
                  <ItemRow key={`er-${i}`}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{r}</Typography>
                  </ItemRow>
                ))}
              </ListCard>
            )}
            {exitRulesDisp.length > 0 && (
              <ListCard title="Exit Rules" count={exitRulesDisp.length} hasValue>
                {exitRulesDisp.map((r, i) => (
                  <ItemRow key={`xr-${i}`}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{r}</Typography>
                  </ItemRow>
                ))}
              </ListCard>
            )}
          </Box>
        )
      })()}

      {/* Reminders on this entry — list of active ones with an "+ Add" in the header.
          Mirrors the entry form's ListCard pattern so the vocabulary stays consistent. */}
      <Box sx={{ mt: 2 }}>
        <ListCard
          title="Reminders"
          count={entryReminders.length}
          headerAction={<AddPlusButton label="Add reminder" onClick={() => setReminderDialogOpen(true)} />}
        >
          {entryReminders.map((r) => {
            const when = r.reminder_date
            // The 'decision_horizon' branch was dead code — that string
            // was never in the REMINDER_TYPES enum so the comparison
            // always returned false. Reduced to the two real types
            // ('idea_refresh' and 'prediction_ended', the latter
            // labelled simply as 'Review').
            const typeLabel = r.type === 'idea_refresh' ? 'Refresh idea' : 'Review'
            return (
              <ItemRow
                key={r.id}
                onDelete={() => handleDeleteReminder(r.id)}
                ariaLabel="Remove reminder"
              >
                <NotificationsActiveIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box display="flex" alignItems="baseline" gap={0.75} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>{when}</Typography>
                    <Typography variant="caption" color="text.secondary">· {typeLabel}</Typography>
                  </Box>
                  {r.note && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.note}
                    </Typography>
                  )}
                </Box>
              </ItemRow>
            )
          })}
        </ListCard>
      </Box>

      {/* Quick actions row — visible on mobile */}
      {isMobile && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<NotificationsActiveIcon sx={{ fontSize: 16 }} />}
            onClick={() => setReminderDialogOpen(true)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1 }}
          >
            Remind me
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
            component={RouterLink}
            to={`/entries/${entry.id}/edit`}
            sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1 }}
          >
            Edit
          </Button>
        </Box>
      )}

      {/* ── Tabbed sections: Actions / Predictions / Feelings ── */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={detailTab}
            onChange={(_, v) => setDetailTab(v)}
            variant="scrollable"
            scrollButtons={false}
            sx={{ flex: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.8rem', minWidth: 0, px: 1.5 } }}
          >
            <Tab label={`Actions (${actions.length})`} />
            <Tab label={`Predictions (${predictions.length})`} />
            <Tab label="Valuation" />
          </Tabs>
          {detailTab === 0 && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => setActionDialogOpen(true)} sx={{ flexShrink: 0, mr: 0.5, fontSize: '0.75rem' }}>
              Add
            </Button>
          )}
          {detailTab === 1 && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => { setEditingPrediction(null); setPredictionDialogOpen(true); }} sx={{ flexShrink: 0, mr: 0.5, fontSize: '0.75rem' }}>
              Add
            </Button>
          )}
        </Box>

        {/* Tab 0: Actions */}
        {detailTab === 0 && (
          <Box sx={{ pt: 1.5 }}>
            {actions.length === 0 ? (
              <EmptyState
                dense
                icon={<TimelineIcon />}
                title="No decisions on this entry yet"
                action={
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setActionDialogOpen(true)} sx={{ textTransform: 'none' }}>
                    Add decision
                  </Button>
                }
              />
            ) : (
              <Stack spacing={1}>
                {actions.map((a) => (
                  <DecisionCard
                    key={a.id}
                    action={a}
                    outcome={outcomesByActionId[a.id]}
                    currentPrice={a.ticker ? currentPriceByTicker[(a.ticker || '').trim().toUpperCase()] : undefined}
                    onAddOrEditOutcome={() => setOutcomeDialogActionId(a.id)}
                    onDelete={() => setConfirmDelete({ type: 'action', id: a.id })}
                    onEdit={() => setEditingAction(a)}
                  />
                ))}
              </Stack>
            )}
            {/* Link to per-ticker aggregate view */}
            {actions[0]?.ticker && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  component={RouterLink}
                  to={`/tickers/${encodeURIComponent(actions[0].ticker.trim().toUpperCase())}`}
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: 'none' }}
                >
                  View all ${actions[0].ticker.trim().toUpperCase()} decisions
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Tab 1: Predictions */}
        {detailTab === 1 && (
          <Box sx={{ pt: 1.5 }}>
            {predictions.length === 0 ? (
              <EmptyState
                dense
                icon={<QueryStatsIcon />}
                title="No predictions on this entry yet"
                action={
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingPrediction(null); setPredictionDialogOpen(true); }} sx={{ textTransform: 'none' }}>
                    Add prediction
                  </Button>
                }
              />
            ) : (
              <Stack spacing={1}>
                {predictions.map((p) => (
                  <PredictionCard
                    key={p.id}
                    prediction={p}
                    onEdit={() => { setEditingPrediction(p); setPredictionDialogOpen(true); }}
                    onDelete={() => setConfirmDelete({ type: 'prediction', id: p.id })}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* Tab 2: Valuation (Huber 3 Engines) */}
        {detailTab === 2 && id && (
          <Box sx={{ pt: 1.5 }}>
            <ValuationWidget entryId={id} defaultExpanded />
          </Box>
        )}
      </Box>

      <ActionFormDialog
        open={actionDialogOpen || editingAction != null}
        onClose={() => { setActionDialogOpen(false); setEditingAction(null) }}
        initial={editingAction ?? undefined}
        onSubmit={async (data) => {
          if (!user?.id) return
          if (editingAction) {
            // Edit existing decision in place — keep entry_id, update everything else.
            await updateAction(editingAction.id, {
              type: data.type,
              ticker: data.ticker,
              company_name: data.company_name || null,
              action_date: data.action_date,
              price: data.price,
              currency: data.currency || null,
              shares: data.shares,
              reason: data.reason,
              notes: data.notes,
              kill_criteria: data.kill_criteria || null,
              pre_mortem_text: data.pre_mortem_text || null,
              size: data.size,
            })
            if (data.type === 'pass' && data.ticker?.trim()) {
              await ensurePassedForUser(user.id, data.ticker.trim(), {
                passed_date: data.action_date,
                reason: data.reason ?? '',
                notes: data.notes ?? '',
              })
              invalidate.passed()
            }
            invalidate.actions()
            showSuccess('Decision updated')
            setEditingAction(null)
            return
          }
          if (!id) return
          await createAction({
            user_id: user.id,
            entry_id: id,
            type: data.type,
            ticker: data.ticker,
            company_name: data.company_name || null,
            action_date: data.action_date,
            price: data.price,
            currency: data.currency || null,
            shares: data.shares,
            reason: data.reason,
            notes: data.notes,
            kill_criteria: data.kill_criteria || null,
            pre_mortem_text: data.pre_mortem_text || null,
            size: data.size,
            raw_snippet: null,
          })
          if (data.type === 'pass' && user?.id && data.ticker?.trim()) {
            await ensurePassedForUser(user.id, data.ticker.trim(), {
              passed_date: data.action_date,
              reason: data.reason ?? '',
              notes: data.notes ?? '',
            })
            invalidate.passed()
          }
          invalidate.actions()
          showSuccess(`${data.type.charAt(0).toUpperCase() + data.type.slice(1)} action added`)
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={
          confirmDelete?.type === 'entry'
            ? 'Delete entry?'
            : confirmDelete?.type === 'action'
              ? 'Delete action?'
              : confirmDelete?.type === 'prediction'
                ? 'Delete prediction?'
                : 'Delete?'
        }
        message={
          confirmDelete?.type === 'entry'
            ? 'This will permanently delete this journal entry and all its actions and outcomes.'
            : confirmDelete?.type === 'action'
              ? 'This will permanently delete this action and its outcome.'
              : confirmDelete?.type === 'prediction'
                ? 'This prediction will be removed from this entry.'
                : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmColor="error"
        loading={confirmLoading}
        onConfirm={async () => {
          if (!confirmDelete) return
          setConfirmLoading(true)
          try {
            if (confirmDelete.type === 'entry' && id) {
              await deleteEntry(id)
              invalidate.entries()
              showSuccess('Entry deleted')
              navigate('/')
            } else if (confirmDelete.type === 'action') {
              await deleteAction(confirmDelete.id)
              invalidate.actions()
              invalidate.outcomes()
              showSuccess('Action deleted')
            } else if (confirmDelete.type === 'prediction') {
              await deletePrediction(confirmDelete.id)
              invalidate.predictions(id)
              showSuccess('Prediction deleted')
            }
            setConfirmDelete(null)
          } finally {
            setConfirmLoading(false)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <AddReminderDialog
        open={reminderDialogOpen}
        onClose={() => setReminderDialogOpen(false)}
        entryTitle={getEntryDisplayTitle(entry, actions)}
        onSubmit={async (reminderDate, note) => {
          if (!user?.id || !entry?.id) return
          await createReminder(user.id, {
            entry_id: entry.id,
            type: 'entry_review',
            reminder_date: reminderDate,
            note,
          })
          showSuccess('Reminder set')
        }}
      />
      <PredictionFormDialog
        open={predictionDialogOpen}
        onClose={() => { setPredictionDialogOpen(false); setEditingPrediction(null); }}
        initial={editingPrediction}
        onSubmit={async (data) => {
          if (!id) return
          if (editingPrediction) {
            await updatePrediction(editingPrediction.id, {
              probability: data.probability,
              end_date: data.end_date,
              type: data.type,
              label: data.label || null,
              ticker: data.ticker || null,
              sub_skill: data.sub_skill,
            })
          } else {
            await createPrediction({
              entry_id: id,
              probability: data.probability,
              end_date: data.end_date,
              type: data.type,
              label: data.label || null,
              ticker: data.ticker || null,
              sub_skill: data.sub_skill,
            })
          }
          invalidate.predictions(id)
          showSuccess(editingPrediction ? 'Prediction updated' : 'Prediction added')
        }}
      />
      {outcomeDialogActionId && (
        <OutcomeFormDialog
          open={!!outcomeDialogActionId}
          onClose={() => setOutcomeDialogActionId(null)}
          initial={outcomeDialogActionId ? outcomesByActionId[outcomeDialogActionId] ?? null : null}
          actionLabel={actions.find((a) => a.id === outcomeDialogActionId)?.ticker
            ? getTickerDisplayLabel(actions.find((a) => a.id === outcomeDialogActionId)?.ticker ?? '')
            : undefined}
          onSubmit={async (data) => {
            if (!outcomeDialogActionId) return
            const existing = outcomesByActionId[outcomeDialogActionId]
            if (existing) {
              await updateOutcome(existing.id, {
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
            } else {
              await createOutcome({
                action_id: outcomeDialogActionId,
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
            }
            const wasEdit = !!outcomesByActionId[outcomeDialogActionId]
            invalidate.outcomes()
            setOutcomeDialogActionId(null)
            showSuccess(wasEdit ? 'Outcome updated' : 'Outcome recorded')
          }}
        />
      )}
    </Box>
  )
}
