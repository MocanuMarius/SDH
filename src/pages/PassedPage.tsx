import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Typography, Button, TextField, CircularProgress, Alert, List, ListItem, ListItemText, IconButton, Link } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import { useAuth } from '../contexts/AuthContext'
import { listPassed, createPassed, deletePassed } from '../services/passedService'
import { listActions } from '../services/actionsService'
import ConfirmDialog from '../components/ConfirmDialog'
import TickerLinks from '../components/TickerLinks'
import RelativeDate from '../components/RelativeDate'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from '../components/OptionTypeChip'
import { fetchChartData } from '../services/chartApiService'
import { computeCagrFromChart, formatCagrPercent, formatDurationSince } from '../utils/cagr'
import type { Passed } from '../types/database'

export default function PassedPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Passed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTicker, setNewTicker] = useState('')
  const [newReason, setNewReason] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [cagrById, setCagrById] = useState<Record<string, number | null | 'loading'>>({})

  const load = () => {
    setLoading(true)
    listPassed()
      .then(setItems)
      .catch((e) => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    setCagrById(Object.fromEntries(items.map((p) => [p.id, 'loading' as const])))
    items.forEach((p) => {
      fetchChartData(p.ticker.trim().toUpperCase(), '5y')
        .then((data) => {
          if (cancelled) return
          if (!data?.dates?.length || !data?.prices?.length) {
            setCagrById((prev) => ({ ...prev, [p.id]: null }))
            return
          }
          const cagr = computeCagrFromChart(data.dates, data.prices, p.passed_date)
          setCagrById((prev) => ({ ...prev, [p.id]: cagr }))
        })
        .catch(() => {
          if (!cancelled) setCagrById((prev) => ({ ...prev, [p.id]: null }))
        })
    })
    return () => { cancelled = true }
  }, [items])

  const handleAdd = async () => {
    if (!user || !newTicker.trim()) return
    setAdding(true)
    try {
      await createPassed(user.id, { ticker: newTicker.trim(), reason: newReason.trim() })
      setNewTicker('')
      setNewReason('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  const handleAddFromJournal = async () => {
    if (!user) return
    setSyncing(true)
    setError(null)
    try {
      const [passActions, existingPassed] = await Promise.all([
        listActions({ type: 'pass', limit: 2000, offset: 0 }),
        listPassed(),
      ])
      const existingTickers = new Set(existingPassed.map((p) => p.ticker.toUpperCase()))
      const byTicker: Record<string, { reason: string; action_date: string }> = {}
      passActions.forEach((a) => {
        if (!a.ticker?.trim()) return
        const t = a.ticker.trim().toUpperCase()
        if (existingTickers.has(t)) return
        if (!byTicker[t] || (a.action_date && a.action_date > (byTicker[t].action_date || ''))) {
          byTicker[t] = { reason: a.reason || '', action_date: a.action_date || '' }
        }
      })
      for (const [ticker, { reason, action_date }] of Object.entries(byTicker)) {
        await createPassed(user.id, { ticker, reason, passed_date: action_date || new Date().toISOString().slice(0, 10) })
      }
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add from journal')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        Passed ideas
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        Ideas you passed on (did not buy). Errors of omission are as important as errors of commission. This list is separate from your journal; &quot;Pass&quot; decisions in entries appear under <strong>Actions</strong> (filter: Pass). Use the button below to add those here.
      </Typography>

      <Button
        variant="outlined"
        size="small"
        startIcon={<PlaylistAddIcon />}
        onClick={handleAddFromJournal}
        disabled={syncing}
        sx={{ mb: 2 }}
      >
        {syncing ? 'Adding…' : 'Add from journal (Pass decisions)'}
      </Button>

      <Box
        component="form"
        display="flex"
        gap={1}
        alignItems="center"
        sx={{ mb: 2 }}
        onSubmit={(e) => {
          e.preventDefault()
          handleAdd()
        }}
      >
        <TextField
          size="small"
          placeholder="Ticker (e.g. AAPL)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value)}
          sx={{ minWidth: 120 }}
        />
        <TextField
          size="small"
          placeholder="Reason"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          sx={{ maxWidth: 200 }}
        />
        <Button type="submit" variant="contained" size="small" disabled={adding || !newTicker.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="Remove passed idea?"
        message="This will remove this item from your passed list."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        confirmColor="error"
        loading={confirmLoading}
        onConfirm={async () => {
          if (!deleteConfirmId) return
          setConfirmLoading(true)
          try {
            await deletePassed(deleteConfirmId)
            load()
            setDeleteConfirmId(null)
          } finally {
            setConfirmLoading(false)
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {items.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography color="text.secondary" variant="body2">
            No passed ideas yet. Use the button above to add ideas you decided not to buy.
          </Typography>
        </Box>
      ) : (
        <List dense>
          {items.map((p) => (
            <ListItem
              key={p.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => setDeleteConfirmId(p.id)}
                  aria-label="Remove passed idea"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Link component={RouterLink} to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(p.ticker) || p.ticker.toUpperCase())}`} underline="hover" fontWeight={600}>
                      {getTickerDisplayLabel(p.ticker)}
                    </Link>
                    <OptionTypeChip ticker={p.ticker} />
                  </Box>
                }
                secondary={
                  <>
                    <RelativeDate date={p.passed_date} variant="body2" />
                    {p.reason ? <> · <TickerLinks text={p.reason} variant="link" dense /></> : null}
                    {cagrById[p.id] === 'loading' ? (
                      <Typography component="span" variant="body2" display="block" sx={{ mt: 0.5 }}>…</Typography>
                    ) : typeof cagrById[p.id] === 'number' ? (
                      <Typography component="span" variant="body2" display="block" sx={{ mt: 0.5 }}>
                        If you had bought ({formatDurationSince(p.passed_date)} ago), you would have had{' '}
                        <Box component="span" sx={{ fontWeight: 600, color: (cagrById[p.id] as number) >= 0 ? 'success.main' : 'error.main' }}>
                          {formatCagrPercent(cagrById[p.id] as number)} CAGR
                        </Box>
                      </Typography>
                    ) : cagrById[p.id] === null ? (
                      <Typography component="span" variant="body2" display="block" sx={{ mt: 0.5 }} color="text.secondary">No chart data for CAGR</Typography>
                    ) : null}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
