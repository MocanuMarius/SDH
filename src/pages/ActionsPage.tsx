import { useEffect, useState, useMemo } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  Box,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  Link,
  Skeleton,
  Chip,
  Button,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef, GridRenderCellParams, GridColumnVisibilityModel } from '@mui/x-data-grid'
import { type ActionWithEntry } from '../services/actionsService'
import { createOutcome } from '../services/outcomesService'
import { useActions, useOutcomesByActionIds, useInvalidate } from '../hooks/queries'
import { fetchChartData } from '../services/chartApiService'
import PlainTextWithTickers from '../components/PlainTextWithTickers'
import TickerLinks from '../components/TickerLinks'
import RelativeDate from '../components/RelativeDate'
import { getEntryDisplayTitle, isAutomatedEntry } from '../utils/entryTitle'
import { getTickerDisplayLabel, isOptionSymbol } from '../utils/tickerCompany'
import { normalizeTicker } from '../utils/tickerNormalization'
import { PageHeader, EmptyState } from '../components/system'
import InsightsIcon from '@mui/icons-material/Insights'
import OptionTypeChip from '../components/OptionTypeChip'
import { ACTION_TYPES } from '../types/database'
import DecisionChip from '../components/DecisionChip'
import OutcomeFormDialog from '../components/OutcomeFormDialog'
import { useTickerChart } from '../contexts/TickerChartContext'
import type { Outcome } from '../types/database'

function parsePrice(price: string | null | undefined): number | null {
  if (price == null || typeof price !== 'string') return null
  const cleaned = price.replace(/,/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function ActionsPage() {
  const { openChart } = useTickerChart()
  const [currentPriceByTicker, setCurrentPriceByTicker] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [hideAutomated, setHideAutomated] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('type') || ''
  const tickerFilter = searchParams.get('ticker') || ''
  const setTypeFilter = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('type', v); else next.delete('type')
    setSearchParams(next, { replace: true })
  }
  const setTickerFilter = (v: string) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set('ticker', v); else next.delete('ticker')
    setSearchParams(next, { replace: true })
  }
  const [outcomeDialogAction, setOutcomeDialogAction] = useState<ActionWithEntry | null>(null)
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 })
  const theme = useTheme()
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'))
  const invalidate = useInvalidate()

  const normalizedTickerFilter = tickerFilter.trim() ? normalizeTicker(tickerFilter.trim()) : undefined
  const actionsQ = useActions({ type: typeFilter || undefined, ticker: normalizedTickerFilter, limit: 500 })
  // Stable reference for downstream useMemos.
  const actions: ActionWithEntry[] = useMemo(() => actionsQ.data ?? [], [actionsQ.data])
  const outcomesQ = useOutcomesByActionIds(actions.map((a) => a.id))
  const outcomesByActionId = useMemo(() => {
    const map: Record<string, Outcome> = {}
    ;(outcomesQ.data ?? []).forEach((o) => { map[o.action_id] = o })
    return map
  }, [outcomesQ.data])
  const loading = actionsQ.isLoading
  useEffect(() => {
    if (actionsQ.error) setError((actionsQ.error as Error).message ?? 'Failed to load actions')
  }, [actionsQ.error])
  useEffect(() => { setPaginationModel((prev) => ({ ...prev, page: 0 })) }, [typeFilter, tickerFilter])

  // Fetch current prices — parallel Promise.all (cache in chartApiService prevents re-fetching)
  const tickersToFetch = useMemo(
    () =>
      Array.from(
        new Set(actions.filter((a) => a.ticker?.trim()).map((a) => normalizeTicker(a.ticker || '')))
      ).filter(Boolean).slice(0, 40),
    [actions]
  )
  // Stable string key — derived once per tickersToFetch identity change so
  // the useEffect below uses a primitive dep instead of a complex expression.
  const tickersKey = tickersToFetch.join(',')

  useEffect(() => {
    if (tickersToFetch.length === 0) return
    let cancelled = false
    Promise.all(
      tickersToFetch.map((ticker) =>
        fetchChartData(ticker, '3m')
          .then((data) => ({ ticker, price: data?.prices?.[data.prices.length - 1] ?? null }))
          .catch(() => ({ ticker, price: null }))
      )
    ).then((results) => {
      if (cancelled) return
      const next: Record<string, number> = {}
      results.forEach(({ ticker, price }) => {
        if (price != null && Number.isFinite(price)) next[ticker] = price
      })
      setCurrentPriceByTicker((prev) => ({ ...prev, ...next }))
    })
    return () => { cancelled = true }
    // tickersKey: stable string key derived from tickersToFetch so the
    // effect re-runs only when the actual ticker SET changes, not on every
    // tickersToFetch reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey])

  const allTickers = useMemo(
    () =>
      Array.from(
        new Set(actions.map((a) => normalizeTicker(a.ticker || '')).filter(Boolean))
      ).sort(),
    [actions]
  )

  // Filter automated entries, then enrich with computed fields
  const filteredActions = useMemo(
    () => hideAutomated ? actions.filter((a) => !a.entry || !isAutomatedEntry(a.entry as { tags: string[]; author: string })) : actions,
    [actions, hideAutomated]
  )

  const rows = useMemo(
    () =>
      filteredActions.map((row) => {
        const outcome = outcomesByActionId[row.id]
        const tickerKey = normalizeTicker(row.ticker || '')
        const currentPrice = tickerKey ? currentPriceByTicker[tickerKey] ?? null : null
        const decisionPrice = parsePrice(row.price)
        const isUnderlying = !isOptionSymbol(row.ticker)
        const oppReturnPct =
          isUnderlying && decisionPrice != null && currentPrice != null && decisionPrice > 0
            ? ((currentPrice - decisionPrice) / decisionPrice) * 100
            : null
        return { ...row, currentPrice, decisionPrice, oppReturnPct, outcome }
      }),
    [filteredActions, outcomesByActionId, currentPriceByTicker]
  )

  type Row = (typeof rows)[number]

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: 'type',
        headerName: 'Type',
        width: isMobile ? 88 : 110,
        renderCell: (p: GridRenderCellParams<Row>) => (
          <DecisionChip type={p.value as string} size="small" />
        ),
      },
      {
        field: 'ticker',
        headerName: 'Symbol',
        width: isMobile ? 92 : 130,
        renderCell: (p: GridRenderCellParams<Row>) =>
          p.value ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                onClick={(e) => { e.stopPropagation(); openChart(p.value as string) }}
                sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
              >
                {getTickerDisplayLabel(p.value as string)}
              </Typography>
              <OptionTypeChip ticker={p.value as string} />
            </Box>
          ) : (
            '—'
          ),
      },
      {
        field: 'action_date',
        headerName: 'Date',
        // 84 px was eating the tail off labels like "3 months ago" — they
        // truncated to "3 months a..." on mobile with no tooltip on the
        // grid cell. 108 px fits the longest realistic label.
        width: isMobile ? 108 : 120,
        renderCell: (p: GridRenderCellParams<Row>) => <RelativeDate date={p.value as string} />,
      },
      {
        field: 'decisionPrice',
        headerName: 'Price',
        width: 100,
        renderCell: (p: GridRenderCellParams<Row>) =>
          p.value != null ? (
            <Typography variant="body2" fontWeight={500}>
              {(p.value as number).toFixed(2)}
              {p.row.currency ? <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>{p.row.currency}</Typography> : null}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">—</Typography>
          ),
      },
      {
        field: 'currentPrice',
        headerName: 'Current price',
        width: 120,
        renderCell: (p: GridRenderCellParams<Row>) => {
          if (p.value != null) return <Typography variant="body2">{(p.value as number).toFixed(2)}</Typography>
          // Distinguish "no chart for this ticker yet" (still fetching) from "no data".
          // If the ticker key isn't yet in the price cache at all, show a subtle dot.
          const tickerKey = normalizeTicker(p.row.ticker || '')
          const inFlight = tickerKey && tickersToFetch.includes(tickerKey) && !(tickerKey in currentPriceByTicker)
          return inFlight
            ? <Typography variant="caption" color="text.secondary">…</Typography>
            : <Typography variant="caption" color="text.secondary">—</Typography>
        },
      },
      {
        field: 'oppReturnPct',
        headerName: 'Opp return',
        width: 120,
        renderCell: (p: GridRenderCellParams<Row>) => {
          const pct = p.value as number | null
          const outcome = p.row.outcome
          if (pct == null) return <Typography variant="caption" color="text.secondary">—</Typography>
          return (
            <Box>
              <Typography
                variant="body2"
                color={pct >= 0 ? 'success.main' : 'error.main'}
                fontWeight={500}
              >
                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
              </Typography>
              {outcome?.realized_pnl != null && (
                <Typography variant="caption" display="block" color="text.secondary">
                  Realized {Number(outcome.realized_pnl) >= 0 ? '+' : ''}
                  {Number(outcome.realized_pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </Typography>
              )}
            </Box>
          )
        },
      },
      {
        field: 'reason',
        headerName: 'Reason',
        flex: 1,
        minWidth: 160,
        renderCell: (p: GridRenderCellParams<Row>) =>
          p.value ? <TickerLinks text={p.value as string} variant="chip" dense /> : <span>—</span>,
      },
      {
        field: 'entry',
        headerName: 'Entry',
        flex: 1,
        minWidth: 160,
        renderCell: (p: GridRenderCellParams<Row>) => {
          const entryVal = p.value as ActionWithEntry['entry'] | null | undefined
          if (!entryVal) return <span>—</span>
          return (
            <Link component={RouterLink} to={`/entries/${entryVal.id}`} underline="hover" color="inherit">
              <PlainTextWithTickers source={getEntryDisplayTitle({ title_markdown: entryVal.title_markdown }, [p.row])} inline dense tickerAsLink={false} />
            </Link>
          )
        },
      },
      {
        field: 'id',
        headerName: '',
        width: isMobile ? 88 : 110,
        sortable: false,
        renderCell: (p: GridRenderCellParams<Row>) =>
          !p.row.outcome ? (
            <Link
              component="button"
              variant="body2"
              onClick={() => setOutcomeDialogAction(p.row)}
              sx={{ cursor: 'pointer', fontSize: isMobile ? '0.78rem' : undefined }}
            >
              Add outcome
            </Link>
          ) : null,
      },
    ],
    [openChart, isMobile, tickersToFetch, currentPriceByTicker]
  )

  // Hide some columns on mobile
  const columnVisibilityModel: GridColumnVisibilityModel = isMobile
    ? { decisionPrice: false, currentPrice: false, oppReturnPct: false, reason: false, entry: false }
    : {}

  return (
    <Box>
      <PageHeader title="Trades" />

      <Box display="flex" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 120 }} variant="outlined">
          <InputLabel>Type</InputLabel>
          <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {ACTION_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                <DecisionChip type={t} size="small" sx={{ pointerEvents: 'none' }} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Autocomplete
          size="small"
          options={allTickers}
          value={tickerFilter || null}
          onChange={(_, v) => setTickerFilter(v ?? '')}
          renderInput={(params) => <TextField {...params} label="Ticker" sx={{ minWidth: 130 }} />}
          clearOnEscape
        />
        <Chip
          size="small"
          label={hideAutomated ? 'Auto off' : 'Auto on'}
          onClick={() => setHideAutomated((v) => !v)}
          variant={hideAutomated ? 'filled' : 'outlined'}
          sx={{ height: 32, fontSize: '0.7rem' }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<InsightsIcon />}
          title="No trades logged yet"
          action={
            <Button
              component={RouterLink}
              to="/entries/new"
              variant="contained"
              size="small"
              sx={{ textTransform: 'none' }}
            >
              New entry
            </Button>
          }
        />
      ) : (
        <DataGrid
          rows={rows}
          columns={columns}
          columnVisibilityModel={columnVisibilityModel}
          density="compact"
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            '& .MuiDataGrid-cell': {
              alignItems: 'center',
              display: 'flex',
              ...(isMobile && { paddingLeft: '6px', paddingRight: '6px' }),
            },
            '& .MuiDataGrid-columnHeader': {
              bgcolor: 'background.default',
              ...(isMobile && { paddingLeft: '6px', paddingRight: '6px' }),
            },
          }}
        />
      )}

      <OutcomeFormDialog
        open={!!outcomeDialogAction}
        onClose={() => setOutcomeDialogAction(null)}
        initial={null}
        actionLabel={outcomeDialogAction?.ticker ? getTickerDisplayLabel(outcomeDialogAction.ticker) : undefined}
        onSubmit={async (data) => {
          if (!outcomeDialogAction) return
          try {
            await createOutcome({
              action_id: outcomeDialogAction.id,
              realized_pnl: data.realized_pnl,
              outcome_date: data.outcome_date,
              notes: data.notes,
              driver: data.driver,
              post_mortem_notes: data.post_mortem_notes,
              process_quality: data.process_quality,
              outcome_quality: data.outcome_quality,
              process_score: data.process_score,
              outcome_score: data.outcome_score,
              closing_memo: data.closing_memo || null,
              error_type: data.error_type,
              what_i_remember_now: data.what_i_remember_now,
            })
            // Close immediately — react-query refreshes everything subscribed to outcomes.
            setOutcomeDialogAction(null)
            invalidate.outcomes()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save outcome')
          }
        }}
      />
    </Box>
  )
}
