/**
 * DecisionFormPage — routed host for ActionForm.
 *
 * Routes:
 *   /decisions/new                          — log a new decision
 *   /decisions/new?ticker=$XYZ              — pre-fill ticker
 *   /decisions/new?ticker=$XYZ&entry_id=…   — attach to entry
 *   /decisions/new?ticker=$XYZ&type=sell    — pre-fill type
 *   /decisions/:id/edit                     — edit an existing decision
 *
 * Replaces the global ActionFormDialog modal that used to mount in
 * App.tsx. Same form, just inside its own page chrome — sticky title
 * via PageHeader, navigation back via Cancel / Save / Browser back.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Box, Alert, CircularProgress } from '@mui/material'
import ActionForm from '../components/ActionForm'
import { PageHeader } from '../components/system'
import { createAction, updateAction, getAction } from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import { useAuth } from '../contexts/AuthContext'
import { useInvalidate } from '../hooks/queries'
import { useSnackbar } from '../contexts/SnackbarContext'
import type { Action } from '../types/database'

export default function DecisionFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const { showSuccess } = useSnackbar()

  const [initial, setInitial] = useState<Partial<Action> | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)

  // For new decisions, build the initial pre-fill from query params.
  // For edit, fetch the existing row.
  useEffect(() => {
    let cancelled = false
    if (isEdit && id) {
      setLoading(true)
      getAction(id)
        .then((a) => {
          if (cancelled) return
          if (!a) {
            setError('Decision not found.')
          } else {
            setInitial(a)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load decision')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      // New: assemble pre-fill from query params (ticker, entry_id, type).
      const ticker = searchParams.get('ticker') ?? undefined
      const entry_id = searchParams.get('entry_id') ?? undefined
      const type = (searchParams.get('type') as Action['type'] | null) ?? undefined
      const pre: Partial<Action> = {}
      if (ticker) pre.ticker = ticker
      if (entry_id) pre.entry_id = entry_id
      if (type) pre.type = type
      setInitial(Object.keys(pre).length ? pre : null)
    }
    return () => { cancelled = true }
  }, [id, isEdit, searchParams])

  /** Where does the user go after Cancel / Save? Prefer the optional
   *  `from` query param; fall back to the entry's detail page if the
   *  decision is attached to one; otherwise /actions. */
  const goBack = () => {
    const from = searchParams.get('from')
    if (from) {
      navigate(from)
      return
    }
    if (initial?.entry_id) {
      navigate(`/entries/${initial.entry_id}`)
      return
    }
    navigate('/actions')
  }

  const handleSubmit = async (data: Parameters<React.ComponentProps<typeof ActionForm>['onSubmit']>[0]) => {
    if (!user?.id) return
    if (!data.ticker?.trim()) return
    if (isEdit && id) {
      await updateAction(id, {
        type: data.type,
        ticker: data.ticker.trim().toUpperCase(),
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
      invalidate.actions()
      showSuccess('Decision updated')
    } else {
      const entry_id = initial?.entry_id ?? null
      await createAction({
        user_id: user.id,
        entry_id,
        type: data.type,
        ticker: data.ticker.trim().toUpperCase(),
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
      if (data.type === 'pass') {
        await ensurePassedForUser(user.id, data.ticker.trim(), {
          passed_date: data.action_date,
          reason: data.reason ?? '',
          notes: data.notes ?? '',
        })
        invalidate.passed()
      }
      invalidate.actions()
      showSuccess('Decision logged')
    }
    goBack()
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
      <Box sx={{ minWidth: 0 }}>
        <PageHeader title={isEdit ? 'Edit decision' : 'Log decision'} dense />
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        title={isEdit ? 'Edit decision' : 'Log a decision'}
        dense
      />
      <ActionForm
        initial={initial}
        onCancel={goBack}
        onSubmit={handleSubmit}
      />
    </Box>
  )
}
