/**
 * OutcomeFormPage — routed host for OutcomeForm.
 *
 * Routes:
 *   /outcomes/new?action_id=<id>   — record a fresh outcome for a decision
 *   /outcomes/:id/edit             — edit an existing outcome row
 *
 * Replaces the `OutcomeFormDialog` modal that used to open from
 * EntryDetailPage and ActionsPage. Same form body, but with real
 * page width, a sticky save bar, and a URL the user can bookmark
 * or share. Closing a decision is a significant act; it deserves
 * more than a cramped modal with nested accordions.
 *
 * On successful save, navigate back to wherever the user came from
 * (usually the entry detail). The navigation state carries a
 * `justClosedActionId` flag so EntryDetailPage can play a brief
 * "filed away" flourish on the matching DecisionCard.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Box, CircularProgress } from '@mui/material'
import OutcomeForm, { type OutcomeFormData } from '../components/OutcomeForm'
import { PageHeader } from '../components/system'
import {
  createOutcome,
  updateOutcome,
  getOutcomeByActionId,
  getOutcomesForActionIds,
} from '../services/outcomesService'
import { getAction } from '../services/actionsService'
import { createReminder } from '../services/remindersService'
import { useAuth } from '../contexts/AuthContext'
import { useInvalidate } from '../hooks/queries'
import { useSnackbar } from '../contexts/SnackbarContext'
import { getTickerDisplayLabel } from '../utils/tickerCompany'
import { todayISO } from '../utils/dates'
import type { Action, Outcome } from '../types/database'

export default function OutcomeFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const { showSuccess, showError } = useSnackbar()

  const [initial, setInitial] = useState<Outcome | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the outcome (for edit) or the action (for create).
  // For create we also look up any existing outcome on the action
  // so the page gracefully redirects into edit mode if one exists
  // — this prevents duplicate outcome rows from back-and-forth
  // navigation.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        if (isEdit && id) {
          // `id` here is the action_id (we key outcomes by action —
          // there's at most one outcome per action).
          const o = await getOutcomeByActionId(id)
          if (cancelled) return
          if (!o) {
            setError('Outcome not found for this decision.')
            setLoading(false)
            return
          }
          setInitial(o)
          const a = await getAction(id)
          if (!cancelled) setAction(a)
        } else {
          const actionId = searchParams.get('action_id')
          if (!actionId) {
            setError('Missing action reference. Open this page from a decision card.')
            setLoading(false)
            return
          }
          const a = await getAction(actionId)
          if (cancelled) return
          if (!a) {
            setError('Decision not found.')
            setLoading(false)
            return
          }
          setAction(a)
          // Look up existing outcome to avoid dup rows.
          const existing = await getOutcomesForActionIds([actionId])
          if (!cancelled && existing.length > 0) {
            setInitial(existing[0])
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, isEdit, searchParams])

  const goBack = () => {
    if (window.history.length > 1) { navigate(-1); return }
    if (action?.entry_id) { navigate(`/entries/${action.entry_id}`); return }
    navigate('/actions')
  }

  const handleSubmit = async (data: OutcomeFormData) => {
    if (!action) return
    const wasEdit = Boolean(initial?.id)
    if (wasEdit && initial?.id) {
      await updateOutcome(initial.id, {
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
        action_id: action.id,
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
    // Follow-up reminder — only on new outcomes (editing shouldn't
    // spawn a new reminder; the user is fixing wording).
    if (!wasEdit && data.follow_up_in_days != null && user?.id) {
      const date = new Date()
      date.setDate(date.getDate() + data.follow_up_in_days)
      const ticker = action.ticker?.trim().toUpperCase() ?? ''
      try {
        await createReminder(user.id, {
          entry_id: action.entry_id ?? null,
          type: 'entry_review',
          reminder_date: date.toISOString().slice(0, 10) || todayISO(),
          note: ticker
            ? `Check what happened with $${ticker} since this decision`
            : 'Check what happened since this decision',
          ticker,
        })
        invalidate.reminders()
      } catch {
        // Non-fatal — outcome already saved.
        showError('Outcome saved, but the follow-up reminder failed — add it manually from Reminders.')
      }
    }
    invalidate.outcomes()
    showSuccess(wasEdit ? 'Outcome updated  ¶' : 'Outcome recorded  ¶')
    // Navigate back to the entry with a `justClosedActionId` flag
    // so EntryDetailPage can play the "filed away" flourish on the
    // matching DecisionCard (Phase 3 of the outcome reshape).
    if (action.entry_id) {
      navigate(`/entries/${action.entry_id}`, {
        state: { justClosedActionId: action.id },
      })
    } else {
      goBack()
    }
  }

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
        <PageHeader title="Record outcome" dense />
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      </Box>
    )
  }

  const tickerLabel = action?.ticker ? getTickerDisplayLabel(action.ticker) : undefined
  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        title={initial?.id ? 'Edit outcome' : 'Record outcome'}
        eyebrow={tickerLabel ? <span>{tickerLabel}</span> : undefined}
        dense
      />
      <OutcomeForm
        initial={initial}
        onSubmit={handleSubmit}
        onCancel={goBack}
        actionLabel={tickerLabel}
      />
    </Box>
  )
}
