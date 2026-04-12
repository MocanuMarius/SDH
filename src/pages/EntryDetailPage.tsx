import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Typography, Alert, Card, CardHeader, CardContent, Stack, Skeleton, Paper, Breadcrumbs, Link, useMediaQuery, IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { getEntry, deleteEntry } from '../services/entriesService'
import { createReminder } from '../services/remindersService'
import { fetchChartData } from '../services/chartApiService'
import { useAuth } from '../contexts/AuthContext'
import {
  listActionsByEntryId,
  createAction,
  deleteAction,
} from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import {
  getOutcomesForActionIds,
  createOutcome,
  updateOutcome,
} from '../services/outcomesService'
import {
  listPredictionsByEntryId,
  createPrediction,
  updatePrediction,
  deletePrediction,
} from '../services/predictionsService'
import {
  listFeelingsByEntryId,
  createFeeling,
  updateFeeling,
  deleteFeeling,
} from '../services/feelingsService'
import ActionFormDialog from '../components/ActionFormDialog'
import PreCommitmentWizard from '../components/PreCommitmentWizard'
import OutcomeFormDialog from '../components/OutcomeFormDialog'
import PredictionFormDialog from '../components/PredictionFormDialog'
import FeelingFormDialog from '../components/FeelingFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import DecisionCard from '../components/DecisionCard'
import PredictionCard from '../components/PredictionCard'
import ValuationWidget from '../components/ValuationWidget'
import FeelingCard from '../components/FeelingCard'
import MarkdownRender from '../components/MarkdownRender'
import AddReminderDialog from '../components/AddReminderDialog'
import RelativeDate from '../components/RelativeDate'
import TagChip from '../components/TagChip'
import { useSnackbar } from '../contexts/SnackbarContext'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import { getTickerDisplayLabel } from '../utils/tickerCompany'
import type { Entry } from '../types/database'
import type { Action } from '../types/database'
import type { Outcome } from '../types/database'
import type { EntryPrediction, EntryFeeling } from '../types/database'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showSuccess } = useSnackbar()
  const muiTheme = useTheme()
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'))
  const [entry, setEntry] = useState<Entry | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [outcomesByActionId, setOutcomesByActionId] = useState<Record<string, Outcome>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [preCommitmentOpen, setPreCommitmentOpen] = useState(false)
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [outcomeDialogActionId, setOutcomeDialogActionId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'action'; id: string }
    | { type: 'entry' }
    | { type: 'prediction'; id: string }
    | { type: 'feeling'; id: string }
    | null
  >(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [predictions, setPredictions] = useState<EntryPrediction[]>([])
  const [feelings, setFeelings] = useState<EntryFeeling[]>([])
  const [predictionDialogOpen, setPredictionDialogOpen] = useState(false)
  const [feelingDialogOpen, setFeelingDialogOpen] = useState(false)
  const [editingPrediction, setEditingPrediction] = useState<EntryPrediction | null>(null)
  const [editingFeeling, setEditingFeeling] = useState<EntryFeeling | null>(null)
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

  const loadActions = useCallback(() => {
    if (!id) return
    listActionsByEntryId(id).then((list) => {
      setActions(list)
      if (list.length > 0) {
        getOutcomesForActionIds(list.map((a) => a.id)).then((outcomes) => {
          const map: Record<string, Outcome> = {}
          outcomes.forEach((o) => { map[o.action_id] = o })
          setOutcomesByActionId(map)
        }).catch(() => {})
      } else {
        setOutcomesByActionId({})
      }
    }).catch(() => {})
  }, [id])


  const loadPredictions = useCallback(() => {
    if (!id) return
    listPredictionsByEntryId(id).then(setPredictions).catch(() => {})
  }, [id])

  const loadFeelings = useCallback(() => {
    if (!id) return
    listFeelingsByEntryId(id).then(setFeelings).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    getEntry(id)
      .then((data) => {
        if (!cancelled) setEntry(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load entry')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    loadActions()
  }, [loadActions])

  useEffect(() => {
    if (!id) return
    loadPredictions()
    loadFeelings()
  }, [id, loadPredictions, loadFeelings])

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
          <MarkdownRender source={getEntryDisplayTitle(entry, actions)} inline dense />
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
          <Box display="flex" gap={0.75} flexShrink={0}>
            <Button
              variant="outlined"
              startIcon={<NotificationsActiveIcon />}
              onClick={() => setReminderDialogOpen(true)}
              sx={{ textTransform: 'none' }}
            >
              Add reminder
            </Button>
            <Button
              component={RouterLink}
              to={`/entries/${entry.id}/edit`}
              variant="outlined"
              startIcon={<EditIcon />}
              sx={{ textTransform: 'none' }}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => setConfirmDelete({ type: 'entry' })}
              sx={{ textTransform: 'none' }}
            >
              Delete entry
            </Button>
          </Box>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} component="span">
        <RelativeDate date={entry.date} sx={{ color: 'inherit' }} />{entry.author ? ` · ${entry.author}` : ''}
      </Typography>
      {entry.tags.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mb: 2 }}>
          {entry.tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </Box>
      )}
      <Box sx={{ '& p:first-of-type': { mt: 0 }, overflowWrap: 'break-word', wordBreak: 'break-word', maxWidth: '100%' }}>
        <MarkdownRender source={entry.body_markdown} dense />
      </Box>

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

      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardHeader
          title="Actions"
          titleTypographyProps={{ variant: 'h6' }}
          action={
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => setPreCommitmentOpen(true)}
              >
                Structured buy
              </Button>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setActionDialogOpen(true)}>
                Add action
              </Button>
            </Box>
          }
          sx={{ pb: 0 }}
        />
        <CardContent>
          {actions.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No actions yet. Add a Buy/Sell (or other) decision.
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
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* John Huber 3 Engines of Value sketchpad — independent valuation toy */}
      {id && <ValuationWidget entryId={id} />}

      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardHeader
          title="Predictions"
          titleTypographyProps={{ variant: 'h6' }}
          action={
            <Button size="small" startIcon={<AddIcon />} onClick={() => { setEditingPrediction(null); setPredictionDialogOpen(true); }}>
              Add prediction
            </Button>
          }
          sx={{ pb: 0 }}
        />
        <CardContent>
          {predictions.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              Optional. Add a time-bound prediction (probability, end date, type).
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
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardHeader
          title="Feelings"
          titleTypographyProps={{ variant: 'h6' }}
          action={
            <Button size="small" startIcon={<AddIcon />} onClick={() => { setEditingFeeling(null); setFeelingDialogOpen(true); }}>
              Add feeling
            </Button>
          }
          sx={{ pb: 0 }}
        />
        <CardContent>
          {feelings.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              Optional. Log how you feel about this idea or the market (score 1–10, type).
            </Typography>
          ) : (
            <Stack spacing={1}>
              {feelings.map((f) => (
                <FeelingCard
                  key={f.id}
                  feeling={f}
                  onEdit={() => { setEditingFeeling(f); setFeelingDialogOpen(true); }}
                  onDelete={() => setConfirmDelete({ type: 'feeling', id: f.id })}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <PreCommitmentWizard
        open={preCommitmentOpen}
        onClose={() => setPreCommitmentOpen(false)}
        onSubmit={async ({ action, prediction }) => {
          if (!id) return
          await createAction({
            entry_id: id,
            type: action.type,
            ticker: action.ticker,
            company_name: action.company_name || null,
            action_date: action.action_date,
            price: action.price,
            currency: action.currency || null,
            shares: action.shares,
            reason: action.reason,
            notes: action.notes,
            kill_criteria: action.kill_criteria || null,
            pre_mortem_text: action.pre_mortem_text || null,
            raw_snippet: null,
          })
          // Fire-and-forget: dialog closes immediately, list refreshes in background.
          if (prediction) {
            createPrediction({
              entry_id: id,
              probability: prediction.probability,
              end_date: prediction.end_date,
              type: 'idea',
              label: prediction.label,
              ticker: action.ticker || null,
              sub_skill: prediction.sub_skill,
            }).then(() => loadPredictions())
          }
          loadActions()
          showSuccess('Decision committed')
        }}
      />
      <ActionFormDialog
        open={actionDialogOpen}
        onClose={() => setActionDialogOpen(false)}
        onSubmit={async (data) => {
          if (!id) return
          await createAction({
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
          // Fire-and-forget so the dialog closes immediately.
          if (data.type === 'pass' && user?.id && data.ticker?.trim()) {
            ensurePassedForUser(user.id, data.ticker.trim(), {
              passed_date: data.action_date,
              reason: data.reason ?? '',
              notes: data.notes ?? '',
            })
          }
          loadActions()
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
                : confirmDelete?.type === 'feeling'
                  ? 'Delete feeling?'
                  : 'Delete?'
        }
        message={
          confirmDelete?.type === 'entry'
            ? 'This will permanently delete this journal entry and all its actions and outcomes.'
            : confirmDelete?.type === 'action'
              ? 'This will permanently delete this action and its outcome.'
              : confirmDelete?.type === 'prediction'
                ? 'This prediction will be removed from this entry.'
                : confirmDelete?.type === 'feeling'
                  ? 'This feeling will be removed from this entry.'
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
              showSuccess('Entry deleted')
              navigate('/')
            } else if (confirmDelete.type === 'action') {
              await deleteAction(confirmDelete.id)
              loadActions()
              showSuccess('Action deleted')
            } else if (confirmDelete.type === 'prediction') {
              await deletePrediction(confirmDelete.id)
              loadPredictions()
              showSuccess('Prediction deleted')
            } else if (confirmDelete.type === 'feeling') {
              await deleteFeeling(confirmDelete.id)
              loadFeelings()
              showSuccess('Feeling deleted')
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
          loadPredictions()
          showSuccess(editingPrediction ? 'Prediction updated' : 'Prediction added')
        }}
      />
      <FeelingFormDialog
        open={feelingDialogOpen}
        onClose={() => { setFeelingDialogOpen(false); setEditingFeeling(null); }}
        initial={editingFeeling}
        onSubmit={async (data) => {
          if (!id) return
          if (editingFeeling) {
            await updateFeeling(editingFeeling.id, {
              score: data.score,
              label: data.label,
              type: data.type,
              ticker: data.ticker || null,
            })
          } else {
            await createFeeling({
              entry_id: id,
              score: data.score,
              label: data.label,
              type: data.type,
              ticker: data.ticker || null,
            })
          }
          loadFeelings()
          showSuccess(editingFeeling ? 'Feeling updated' : 'Feeling logged')
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
            // Close dialog immediately — refresh outcomes in background.
            const wasEdit = !!outcomesByActionId[outcomeDialogActionId]
            setOutcomeDialogActionId(null)
            showSuccess(wasEdit ? 'Outcome updated' : 'Outcome recorded')
            getOutcomesForActionIds(actions.map((a) => a.id)).then((refreshed) => {
              setOutcomesByActionId(Object.fromEntries(refreshed.map((o) => [o.action_id, o])))
            })
          }}
        />
      )}
    </Box>
  )
}
