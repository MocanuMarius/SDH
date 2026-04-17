import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Typography, Alert, Stack, Skeleton, Paper, Breadcrumbs, Link, useMediaQuery, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, TextField, InputAdornment } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import { useTheme } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { deleteEntry, updateEntry } from '../services/entriesService'
import { createReminder } from '../services/remindersService'
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
  useInvalidate,
} from '../hooks/queries'
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
  const actions = actionsQ.data ?? []
  const outcomesQ = useOutcomesByActionIds(actions.map((a) => a.id))
  const outcomesByActionId = useMemo(() => {
    const map: Record<string, Outcome> = {}
    ;(outcomesQ.data ?? []).forEach((o) => { map[o.action_id] = o })
    return map
  }, [outcomesQ.data])
  const predictionsQ = usePredictions(id)
  const predictions = predictionsQ.data ?? []

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
  }, [openActionTickers.join(',')])

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

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.85rem' }}>
        <Link component={RouterLink} to="/" underline="hover" color="inherit">
          Journal
        </Link>
        <Typography fontSize="inherit" color="text.primary" noWrap sx={{ maxWidth: 260 }}>
          {getEntryDisplayTitle(entry, actions).replace(/\*\*([^*]*)\*\*|__([^_]*)__|[*_]/g, '$1$2')}
        </Typography>
      </Breadcrumbs>
      {hasOutcomes && (
        <Alert severity="info" sx={{ mb: 2 }} icon={false}>
          <Typography variant="body2">
            <strong>This entry has recorded outcomes.</strong> Edits will change the historical record — consider adding a follow-up entry instead.
          </Typography>
        </Alert>
      )}
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 600, overflowWrap: 'break-word' }}>
          <PlainTextWithTickers source={getEntryDisplayTitle(entry, actions)} inline dense />
        </Box>
        {isMobile ? (
          <>
            <IconButton
              size="small"
              aria-label="Entry actions"
              onClick={(e) => setOverflowAnchor(e.currentTarget)}
              sx={{ flexShrink: 0, mt: 0.5 }}
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
        ) : (
          <Box display="flex" gap={0.75} flexShrink={0} alignItems="center">
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
          </Box>
        )}
      </Box>
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
          Multi-line auto-grow; Cmd/Ctrl+Enter or Enter (no shift) submits. */}
      <TextField
        size="small"
        placeholder="Add a note…"
        value={quickNote}
        onChange={(e) => setQuickNote(e.target.value)}
        onKeyDown={(e) => {
          // Submit on Enter alone, or Cmd/Ctrl+Enter even with Shift held.
          // Shift+Enter inserts a newline (default textarea behavior).
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
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

      {/* Market Context Display */}
      {(entry.market_feeling || entry.market_context || entry.trading_plan || entry.decision_horizon) && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }} color="text.secondary">
            Decision Context
          </Typography>
          <Stack spacing={1.5}>
            {entry.market_feeling != null && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Market Sentiment</Typography>
                <Typography variant="body2" sx={{ mt: 0.25, color: entry.market_feeling > 0 ? 'success.main' : entry.market_feeling < 0 ? 'error.main' : 'text.secondary', fontWeight: 600 }}>
                  {entry.market_feeling > 0 ? '+' : ''}{entry.market_feeling} — {entry.market_feeling <= -7 ? 'Extreme Fear' : entry.market_feeling <= -3 ? 'Fear' : entry.market_feeling <= -1 ? 'Mild Fear' : entry.market_feeling === 0 ? 'Neutral' : entry.market_feeling <= 2 ? 'Mild Optimism' : entry.market_feeling <= 6 ? 'Optimistic' : 'Extreme Greed'}
                </Typography>
              </Box>
            )}
            {entry.market_context && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Market Conditions</Typography>
                <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ mt: 0.25 }}>
                  {entry.market_context.split(',').map((cond) => {
                    const trimmed = cond.trim()
                    return trimmed ? <Chip key={trimmed} label={trimmed} size="small" variant="outlined" /> : null
                  })}
                </Box>
              </Box>
            )}
            {entry.decision_horizon && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Expected Resolution</Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>{entry.decision_horizon}</Typography>
              </Box>
            )}
            {entry.trading_plan && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Trading Plan</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25, fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: 'grey.50', p: 1, borderRadius: 1 }}>
                  {entry.trading_plan}
                </Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

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
              <Typography color="text.secondary" variant="body2">
                No actions yet. Add a Buy/Sell decision.
              </Typography>
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
              <Typography color="text.secondary" variant="body2">
                Add a time-bound prediction (probability, end date).
              </Typography>
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
