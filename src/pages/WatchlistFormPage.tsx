/**
 * WatchlistFormPage — routed host for the watchlist add/edit form.
 *
 * Routes:
 *   /watchlist/new                — empty form
 *   /watchlist/new?ticker=$XYZ    — pre-fill ticker from a deep link
 *   /watchlist/:id/edit           — pre-load existing item via supabase
 *
 * Replaces the in-page Add/Edit Dialog that used to live inside
 * WatchlistPage. Same form fields + same supabase write semantics
 * (inserts to `watchlist_items` and writes a `watchlist_audit_log`
 * row), just hosted as its own route so the user gets a real URL
 * + browser back / forward + no overlay on top of the list.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import TickerAutocomplete from '../components/TickerAutocomplete'
import { PageHeader } from '../components/system'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const CONDITIONS = ['<', '>', '<=', '>=', '==', '!=']

interface WatchlistItem {
  id: string
  ticker: string
  alert_price: number
  condition: string
  status: string
  trigger_count: number
  created_at: string
}

export default function WatchlistFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [ticker, setTicker] = useState('')
  const [alertPrice, setAlertPrice] = useState('')
  const [condition, setCondition] = useState('>')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [currency, setCurrency] = useState<string>('USD')
  const [_fetchingPrice, setFetchingPrice] = useState(false)

  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null)
  const [editingSnapshot, setEditingSnapshot] = useState<{ condition: string; alert_price: number } | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCurrentPrice = async (tickerSymbol: string, isNewSelection = false): Promise<number | null> => {
    if (!tickerSymbol.trim()) { setCurrentPrice(null); setCurrency('USD'); return null }
    setFetchingPrice(true)
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(tickerSymbol)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.price) {
          setCurrentPrice(data.price)
          setCurrency(data.currency || 'USD')
          if (isNewSelection) setAlertPrice(data.price.toFixed(2))
          return data.price
        }
      }
    } catch (e) {
      console.error('Error fetching price:', e)
    } finally {
      setFetchingPrice(false)
    }
    return null
  }

  // Edit: load the existing item. New: optionally seed from ?ticker=…
  useEffect(() => {
    let cancelled = false
    if (isEdit && id) {
      setLoading(true)
      ;(async () => {
        const { data, error: loadErr } = await supabase
          .from('watchlist_items').select('*').eq('id', id).single()
        if (cancelled) return
        if (loadErr || !data) {
          setError(loadErr?.message ?? 'Alert not found')
          setLoading(false)
          return
        }
        const item = data as WatchlistItem
        setEditingItem(item)
        setEditingSnapshot({ condition: item.condition, alert_price: item.alert_price })
        setTicker(item.ticker)
        setAlertPrice(String(item.alert_price))
        setCondition(item.condition)
        await fetchCurrentPrice(item.ticker, false)
        if (!cancelled) setLoading(false)
      })()
    } else {
      const seedTicker = searchParams.get('ticker')
      if (seedTicker) {
        setTicker(seedTicker)
        fetchCurrentPrice(seedTicker, true)
      }
    }
    return () => { cancelled = true }
  }, [id, isEdit, searchParams])

  const calculatePriceChange = () => {
    if (!currentPrice || !alertPrice) return null
    return ((parseFloat(alertPrice) - currentPrice) / currentPrice) * 100
  }
  const getPriceChangeColor = (diff: number | null) => {
    if (diff === null) return 'text.secondary'
    return diff > 0 ? 'success.main' : diff < 0 ? 'error.main' : 'text.secondary'
  }

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/watchlist')
  }

  const handleSave = async () => {
    if (!ticker.trim() || !alertPrice) {
      setError('Please fill in all fields')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = { ticker: ticker.toUpperCase(), alert_price: parseFloat(alertPrice), condition }
      if (isEdit && id) {
        const { error: updErr } = await supabase
          .from('watchlist_items')
          .update({ ...data, trigger_count: 0, status: 'active' })
          .eq('id', id)
        if (updErr) throw updErr
        await supabase.from('watchlist_audit_log').insert({
          watchlist_item_id: id,
          event_type: 'edited',
          details: {
            before: editingSnapshot,
            after: { condition, alert_price: parseFloat(alertPrice) },
          },
        })
      } else {
        // user_id is required now that watchlist RLS is user-scoped
        // (2026-04-20 migration). Inserts without it used to succeed
        // under the old permissive `USING (true)` policy and left
        // rows with user_id = null, which the user can no longer see
        // post-tightening.
        if (!user?.id) {
          setError('You must be signed in to add alerts.')
          return
        }
        const { data: inserted, error: insErr } = await supabase
          .from('watchlist_items').insert([{ ...data, user_id: user.id }]).select().single()
        if (insErr) throw insErr
        await supabase.from('watchlist_audit_log').insert({
          watchlist_item_id: inserted.id,
          event_type: 'created',
          details: { ticker: data.ticker, condition, alert_price: data.alert_price },
        })
      }
      goBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save alert')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!editingItem) return
    const newStatus = editingItem.status === 'active' ? 'disabled' : 'active'
    try {
      await supabase.from('watchlist_items').update({ status: newStatus }).eq('id', editingItem.id)
      await supabase.from('watchlist_audit_log').insert({
        watchlist_item_id: editingItem.id,
        event_type: newStatus === 'active' ? 'enabled' : 'disabled',
        details: { reason: 'manual_toggle' },
      })
      setEditingItem({ ...editingItem, status: newStatus })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle')
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
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title={isEdit ? 'Edit alert' : 'Add price alert'} dense />
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
      <Stack spacing={2.5} sx={{ pt: 0.5 }}>
        <Box>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Symbol
          </Typography>
          <TickerAutocomplete
            value={ticker}
            onChange={(v) => { setTicker(v); if (v) fetchCurrentPrice(v, false) }}
            onSelectResult={(r) => { fetchCurrentPrice(r.symbol, true) }}
            label=""
            placeholder="Type ticker or company name"
            fullWidth
            size="small"
          />
        </Box>

        {currentPrice != null && (
          <Box sx={{ px: 1, py: 0.75, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current price: <strong>${currentPrice.toFixed(2)}</strong> {currency}
            </Typography>
          </Box>
        )}

        <Box>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Alert when price
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ width: 72, flexShrink: 0 }}>
              <Select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}
              >
                {CONDITIONS.map((c) => (
                  <MenuItem key={c} value={c} sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              placeholder="0.00"
              type="number"
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              size="small"
              fullWidth
              inputProps={{ step: '0.01', inputMode: 'decimal' }}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
            />
          </Box>
        </Box>

        {currentPrice && alertPrice && calculatePriceChange() !== null && (
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: getPriceChangeColor(calculatePriceChange()), pl: 0.5 }}
          >
            {calculatePriceChange()! > 0 ? '+' : ''}{calculatePriceChange()!.toFixed(1)}% from current
          </Typography>
        )}

        {editingItem && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Alert {editingItem.status === 'active' ? 'active' : 'paused'}
            </Typography>
            <Switch checked={editingItem.status === 'active'} onChange={handleToggleStatus} />
          </Box>
        )}
      </Stack>

      {/* Sticky save bar — same pattern as DecisionFormPage so the
          primary actions stay reachable above the BottomNav on mobile. */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          justifyContent: 'flex-end',
          mt: 2,
          position: { xs: 'sticky', sm: 'static' },
          bottom: { xs: 56, sm: 'auto' },
          bgcolor: { xs: 'background.default', sm: 'transparent' },
          pt: { xs: 1, sm: 0 },
          pb: { xs: 1, sm: 0 },
          borderTop: { xs: '1px solid', sm: 'none' },
          borderColor: 'divider',
          mx: { xs: -1.5, sm: 0 },
          px: { xs: 1.5, sm: 0 },
          zIndex: 4,
        }}
      >
        <Button onClick={goBack} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!ticker.trim() || !alertPrice || saving}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Add alert'}
        </Button>
      </Box>
    </Box>
  )
}
