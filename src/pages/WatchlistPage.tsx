import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  Divider,
  Switch,
  Tabs,
  Tab,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import { supabase } from '../services/supabaseClient'
import TickerAutocomplete from '../components/TickerAutocomplete'
import SwipeableCard from '../components/SwipeableCard'

interface WatchlistItem {
  id: string
  ticker: string
  alert_price: number
  condition: string
  status: string
  trigger_count: number
  last_triggered_at: string | null
  created_at: string
}

interface AlertHistory {
  id: string
  ticker: string
  price_when_triggered: number
  alert_price: number
  condition: string
  triggered_at: string
}

/** Shape of the JSONB details column on watchlist_audit_log — union of fields
 *  used across every event_type. All optional because each variant only sets some. */
interface AuditEventDetails {
  condition?: string
  alert_price?: number
  price_when_triggered?: number
  trigger_count?: number
  from_price?: number
  to_price?: number
  reason?: string
  before?: { condition?: string; alert_price?: number }
  after?: { condition?: string; alert_price?: number }
}

interface AuditEntry {
  id: string
  event_type: 'created' | 'edited' | 'triggered' | 'rearmed' | 'disabled' | 'enabled'
  details: AuditEventDetails
  created_at: string
}

const EVENT_META: Record<string, { label: string; color: string; emoji: string }> = {
  created:   { label: 'Created',   color: '#1976d2', emoji: '➕' },
  edited:    { label: 'Edited',    color: '#9c27b0', emoji: '✏️' },
  triggered: { label: 'Triggered', color: '#ed6c02', emoji: '🔔' },
  rearmed:   { label: 'Re-armed',  color: '#2e7d32', emoji: '🔄' },
  disabled:  { label: 'Disabled',  color: '#d32f2f', emoji: '❌' },
  enabled:   { label: 'Enabled',   color: '#2e7d32', emoji: '✅' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const diffMs = Date.now() - then
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) return new Date(iso).toLocaleDateString()
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const d = entry.details || {}
  switch (entry.event_type) {
    case 'created':
      return <Typography variant="caption" color="text.secondary">
        {d.condition} ${Number(d.alert_price).toFixed(2)}
      </Typography>
    case 'edited':
      return <Typography variant="caption" color="text.secondary">
        {d.before && d.after
          ? `${d.before.condition} $${Number(d.before.alert_price).toFixed(2)} → ${d.after.condition} $${Number(d.after.alert_price).toFixed(2)}`
          : 'Alert updated, trigger count reset to 0'}
      </Typography>
    case 'triggered':
      return <Typography variant="caption" color="text.secondary">
        Price ${Number(d.price_when_triggered).toFixed(2)} hit target ${Number(d.alert_price).toFixed(2)} · trigger {d.trigger_count}/10
      </Typography>
    case 'rearmed':
      return <Typography variant="caption" color="text.secondary">
        Target moved ${Number(d.from_price).toFixed(2)} → ${Number(d.to_price).toFixed(2)}
      </Typography>
    case 'disabled':
      return <Typography variant="caption" color="text.secondary">
        {d.reason === 'auto_disabled_10_triggers' ? 'Auto-disabled after 10 triggers' : 'Manually disabled'}
      </Typography>
    case 'enabled':
      return <Typography variant="caption" color="text.secondary">Manually re-enabled</Typography>
    default:
      return null
  }
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [history, setHistory] = useState<AlertHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingSnapshot, setEditingSnapshot] = useState<{ condition: string; alert_price: number } | null>(null)
  // Log dialog
  const [logItem, setLogItem] = useState<WatchlistItem | null>(null)
  const [logEntries, setLogEntries] = useState<AuditEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // Form state
  const [ticker, setTicker] = useState('')
  const [alertPrice, setAlertPrice] = useState('')
  const [condition, setCondition] = useState('>')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const muiTheme = useTheme()
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'))
  const [_fetchingPrice, setFetchingPrice] = useState(false)
  const [currency, setCurrency] = useState<string>('USD')

  // Cached current prices for all alerts
  const [priceCache, setPriceCache] = useState<Record<string, number>>({})

  // Search filter
  const [searchTicker, setSearchTicker] = useState('')
  const [activeTab, setActiveTab] = useState(0)

  const CONDITIONS = ['<', '>', '<=', '>=', '==', '!=']

  const filteredItems = items.filter((item) =>
    item.ticker.toUpperCase().includes(searchTicker.toUpperCase())
  )

  useEffect(() => {
    loadWatchlist()
  }, [])

  // Fetch current prices for all active alerts
  useEffect(() => {
    if (items.length > 0) {
      items.forEach((item) => {
        fetchCurrentPrice(item.ticker, false).then((price) => {
          if (price) {
            setPriceCache((prev) => ({ ...prev, [item.ticker]: price }))
          }
        })
      })
    }
  }, [items])

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

  const loadWatchlist = async () => {
    setLoading(true)
    try {
      const { data: items, error: e1 } = await supabase
        .from('watchlist_items').select('*').order('created_at', { ascending: false })
      if (e1) throw e1

      const { data: history, error: e2 } = await supabase
        .from('watchlist_alert_history').select('*')
        .order('triggered_at', { ascending: false }).limit(50)
      if (e2) throw e2

      setItems(items || [])
      setHistory(history || [])
    } catch (e) {
      console.error('Error loading watchlist:', e)
      setError(e instanceof Error ? e.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = async (item?: WatchlistItem) => {
    if (item) {
      setEditingId(item.id)
      setEditingSnapshot({ condition: item.condition, alert_price: item.alert_price })
      setTicker(item.ticker)
      setAlertPrice(item.alert_price.toString())
      setCondition(item.condition)
      await fetchCurrentPrice(item.ticker)
    } else {
      setEditingId(null)
      setEditingSnapshot(null)
      setTicker('')
      setAlertPrice('')
      setCondition('>')
      setCurrentPrice(null)
    }
    setOpenDialog(true)
  }

  const handleTickerChange = (newTicker: string) => {
    setTicker(newTicker)
    if (newTicker) fetchCurrentPrice(newTicker, false)
  }

  const handleTickerSelect = (result: { symbol: string }) => { fetchCurrentPrice(result.symbol, true) }

  const calculatePriceChange = () => {
    if (!currentPrice || !alertPrice) return null
    return ((parseFloat(alertPrice) - currentPrice) / currentPrice) * 100
  }

  const getPriceChangeColor = (diff: number | null) => {
    if (diff === null) return 'text.secondary'
    return diff > 0 ? 'success.main' : diff < 0 ? 'error.main' : 'text.secondary'
  }

  const handleCloseDialog = () => {
    setOpenDialog(false); setEditingId(null); setEditingSnapshot(null)
    setTicker(''); setAlertPrice(''); setCondition('>')
  }

  const handleSave = async () => {
    if (!ticker.trim() || !alertPrice) { setError('Please fill in all fields'); return }
    try {
      const data = { ticker: ticker.toUpperCase(), alert_price: parseFloat(alertPrice), condition }

      if (editingId) {
        const { error } = await supabase
          .from('watchlist_items')
          .update({ ...data, trigger_count: 0, status: 'active' })
          .eq('id', editingId)
        if (error) throw error

        await supabase.from('watchlist_audit_log').insert({
          watchlist_item_id: editingId,
          event_type: 'edited',
          details: {
            before: editingSnapshot,
            after: { condition, alert_price: parseFloat(alertPrice) },
          },
        })
      } else {
        const { data: inserted, error } = await supabase
          .from('watchlist_items').insert([data]).select().single()
        if (error) throw error

        await supabase.from('watchlist_audit_log').insert({
          watchlist_item_id: inserted.id,
          event_type: 'created',
          details: { ticker: data.ticker, condition, alert_price: data.alert_price },
        })
      }

      handleCloseDialog()
      await loadWatchlist()
    } catch (e) {
      console.error('Error saving alert:', e)
      setError(e instanceof Error ? e.message : 'Failed to save alert')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this alert?')) return
    try {
      const { error } = await supabase.from('watchlist_items').delete().eq('id', id)
      if (error) throw error
      await loadWatchlist()
    } catch (e) {
      console.error('Error deleting alert:', e)
      setError(e instanceof Error ? e.message : 'Failed to delete alert')
    }
  }

  const handleToggleStatus = async (item: WatchlistItem) => {
    const newStatus = item.status === 'active' ? 'disabled' : 'active'
    try {
      const { error } = await supabase
        .from('watchlist_items').update({ status: newStatus }).eq('id', item.id)
      if (error) throw error

      await supabase.from('watchlist_audit_log').insert({
        watchlist_item_id: item.id,
        event_type: newStatus === 'active' ? 'enabled' : 'disabled',
        details: { reason: 'manual' },
      })
      await loadWatchlist()
    } catch (e) {
      console.error('Error updating status:', e)
      setError(e instanceof Error ? e.message : 'Failed to update status')
    }
  }

  const handleOpenLog = async (item: WatchlistItem) => {
    setLogItem(item)
    setLogEntries([])
    setLogLoading(true)
    try {
      const { data, error } = await supabase
        .from('watchlist_audit_log')
        .select('*')
        .eq('watchlist_item_id', item.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setLogEntries(data || [])
    } catch (e) {
      console.error('Error loading audit log:', e)
    } finally {
      setLogLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Watchlist</Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Tab header + Add button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ flex: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.25, textTransform: 'none', fontSize: '0.85rem' } }}
        >
          <Tab label={`Active (${filteredItems.filter(i => i.status === 'active').length})`} />
          <Tab label={`Recent (${history.length})`} />
        </Tabs>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ textTransform: 'none', flexShrink: 0 }}>
          Add
        </Button>
      </Box>

      {/* Tab 0: Active Alerts */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            {/* Search Bar */}
            <TextField
              size="small"
              placeholder="Search ticker..."
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 1.5, width: '100%' }}
            />

            {items.length === 0 ? (
              <Typography color="textSecondary">No alerts yet. Add one to get started!</Typography>
            ) : filteredItems.length === 0 ? (
              <Typography color="textSecondary">No alerts match your search.</Typography>
            ) : isMobile ? (
              /* ── Mobile: swipeable cards — swipe left to reveal actions ── */
              <Stack spacing={1}>
                {filteredItems.map((item) => {
                  const cp = priceCache[item.ticker]
                  const pct = cp ? ((item.alert_price - cp) / cp) * 100 : null
                  return (
                    <SwipeableCard
                      key={item.id}
                      actions={[
                        { icon: <HistoryIcon sx={{ fontSize: 20 }} />, label: 'Log', onClick: () => handleOpenLog(item), color: '#475569' },
                        { icon: <EditIcon sx={{ fontSize: 20 }} />, label: 'Edit', onClick: () => handleOpenDialog(item), color: '#2563eb' },
                        { icon: <DeleteIcon sx={{ fontSize: 20 }} />, label: 'Delete', onClick: () => handleDelete(item.id), color: '#dc2626' },
                      ]}
                      sx={{
                        borderLeft: '3px solid',
                        borderLeftColor: item.status === 'active' ? 'primary.main' : 'action.disabled',
                        opacity: item.status === 'active' ? 1 : 0.55,
                      }}
                    >
                      <Box sx={{ p: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body1" fontWeight={700}>{item.ticker}</Typography>
                          <Chip
                            label={`${item.trigger_count}/10`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          <Typography variant="body2" color="text.secondary">
                            {cp ? `$${cp.toFixed(2)}` : '—'}
                          </Typography>
                          <Typography variant="body2" fontWeight={700} fontFamily="monospace">
                            {item.condition}
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            ${item.alert_price.toFixed(2)}
                          </Typography>
                          {pct != null && (
                            <Typography variant="caption" fontWeight={600} color={pct > 0 ? 'success.main' : 'error.main'}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </SwipeableCard>
                  )
                })}
              </Stack>
            ) : (
              /* ── Desktop: compact table ── */
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Ticker</TableCell>
                      <TableCell align="right">Now</TableCell>
                      <TableCell align="center">Cond</TableCell>
                      <TableCell align="right">Target</TableCell>
                      <TableCell align="center">Triggers</TableCell>
                      <TableCell align="center">On</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const cp = priceCache[item.ticker]
                      const pct = cp ? ((item.alert_price - cp) / cp) * 100 : null
                      return (
                        <TableRow key={item.id} sx={{ opacity: item.status === 'active' ? 1 : 0.5 }}>
                          <TableCell sx={{ fontWeight: 700 }}>{item.ticker}</TableCell>
                          <TableCell align="right">
                            <Box>
                              <Typography variant="body2">{cp ? `$${cp.toFixed(2)}` : '—'}</Typography>
                              {pct != null && (
                                <Typography variant="caption" fontWeight={600} color={pct > 0 ? 'success.main' : 'error.main'}>
                                  {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="center" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.condition}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>${item.alert_price.toFixed(2)}</TableCell>
                          <TableCell align="center">
                            <Chip label={`${item.trigger_count}/10`} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Switch size="small" checked={item.status === 'active'} onChange={() => handleToggleStatus(item)} />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.25}>
                              <IconButton size="small" onClick={() => handleOpenLog(item)}><HistoryIcon fontSize="small" /></IconButton>
                              <IconButton size="small" onClick={() => handleOpenDialog(item)}><EditIcon fontSize="small" /></IconButton>
                              <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}><DeleteIcon fontSize="small" /></IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 1: Recent Alerts */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            {history.length === 0 ? (
              <Typography color="textSecondary">
                No alerts triggered yet. When your price alerts fire, they will appear here.
              </Typography>
            ) : (
              <Stack spacing={0} divider={<Divider />}>
                {history.map((h) => (
                  <Box key={h.id} sx={{ py: 1.25, px: 0.5, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" fontWeight={700} sx={{ minWidth: 50 }}>{h.ticker}</Typography>
                    <Typography variant="body2" fontFamily="monospace">{h.condition} ${Number(h.alert_price).toFixed(2)}</Typography>
                    <Typography variant="body2" fontWeight={600} color="success.main">hit ${Number(h.price_when_triggered).toFixed(2)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {relativeDate(h.triggered_at)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editingId ? 'Edit Alert' : 'Add Alert'}
          {isMobile && (
            <IconButton size="small" onClick={handleCloseDialog} aria-label="Close" edge="end">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {/* Ticker search */}
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Symbol
              </Typography>
              <TickerAutocomplete
                value={ticker}
                onChange={handleTickerChange}
                onSelectResult={handleTickerSelect}
                label=""
                placeholder="Type ticker or company name"
                fullWidth
                size="small"
              />
            </Box>

            {/* Current price */}
            {currentPrice != null && (
              <Box sx={{ px: 1, py: 0.75, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Current price: <strong>${currentPrice.toFixed(2)}</strong> {currency}
                </Typography>
              </Box>
            )}

            {/* Alert when price... */}
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

            {/* % from current */}
            {currentPrice && alertPrice && calculatePriceChange() !== null && (
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: getPriceChangeColor(calculatePriceChange()), pl: 0.5 }}
              >
                {calculatePriceChange()! > 0 ? '+' : ''}{calculatePriceChange()!.toFixed(1)}% from current
              </Typography>
            )}

            {/* Status toggle — only shown when editing an existing alert */}
            {editingId && (() => {
              const editItem = items.find((i) => i.id === editingId)
              if (!editItem) return null
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">
                    Alert {editItem.status === 'active' ? 'active' : 'paused'}
                  </Typography>
                  <Switch
                    checked={editItem.status === 'active'}
                    onChange={() => handleToggleStatus(editItem)}
                  />
                </Box>
              )
            })()}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} variant="outlined">Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!ticker.trim() || !alertPrice}>
            {editingId ? 'Update' : 'Add alert'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Audit log dialog */}
      <Dialog open={!!logItem} onClose={() => setLogItem(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon fontSize="small" />
            {logItem?.ticker} — Alert Log
          </Box>
          {isMobile && (
            <IconButton size="small" onClick={() => setLogItem(null)} aria-label="Close" edge="end">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {logLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : logEntries.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No log entries yet. Events will appear here as the alert is triggered.
            </Typography>
          ) : (
            <Stack spacing={0} divider={<Divider />}>
              {logEntries.map((entry) => {
                const meta = EVENT_META[entry.event_type] || { label: entry.event_type, color: '#666', emoji: '•' }
                return (
                  <Box key={entry.id} sx={{ py: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{meta.emoji}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: meta.color }}
                        >
                          {meta.label}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {fmtDate(entry.created_at)}
                        </Typography>
                      </Box>
                      <AuditDetail entry={entry} />
                    </Box>
                  </Box>
                )
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogItem(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
