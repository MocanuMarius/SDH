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
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef, GridRenderCellParams, GridColumnVisibilityModel } from '@mui/x-data-grid'
import { listActions, type ActionWithEntry } from '../services/actionsService'
import { getOutcomesForActionIds, createOutcome } from '../services/outcomesService'
import { fetchChartData } from '../services/chartApiService'
import MarkdownRender from '../components/MarkdownRender'
import TickerLinks from '../components/TickerLinks'
import RelativeDate from '../components/RelativeDate'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import { getTickerDisplayLabel, isOptionSymbol } from '../utils/tickerCompany'
import { normalizeTicker } from '../utils/tickerNormalization'
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
  const [actions, setActions] = useState<ActionWithEntry[]>([])
  const [outcomesByActionId, setOutcomesByActionId] = useState<Record<string, Outcome>>({})
  const [currentPriceByTicker, setCurrentPriceByTicker] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const normalizedTickerFilter = tickerFilter.trim() ? normalizeTicker(tickerFilter.trim()) : undefined

    // Parallel fetch: actions + (once we have IDs) outcomes
    listActions({ type: typeFilter || undefined, ticker: normalizedTickerFilter, limit: 500 })
      .then(async (data) => {
        if (cancelled) return
        setActions(data)
        if (data.length > 0) {
          const outcomes = await getOutcomesForActionIds(data.map((a) => a.id))
          if (!cancelled) {
            const map: Record<string, Outcome> = {}
            outcomes.forEach((o) => { map[o.action_id] = o })
            setOutcomesByActionId(map)
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load actions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
    return () => { cancelled = true }
  }, [typeFilter, tickerFilter])

  // Fetch current prices — parallel Promise.all (cache in chartApiService prevents re-fetching)
  const tickersToFetch = useMemo(
    () =>
      Array.from(
        new Set(actions.filter((a) => a.ticker?.trim()).map((a) => normalizeTicker(a.ticker || '')))
      ).filter(Boolean).slice(0, 40),
    [actions]
  )

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
  }, [tickersToFetch.join(',')])

  const allTickers = useMemo(
    () =>
      Array.from(
        new Set(actions.map((a) => normalizeTicker(a.ticker || '')).filter(Boolean))
      ).sort(),
    [actions]
  )

  // Enrich rows with computed fields for DataGrid
  const rows = useMemo(
    () =>
      actions.map((row) => {
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
    [actions, outcomesByActionId, currentPriceByTicker]
  )

  type Row = (typeof rows)[number]

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: 'type',
        headerName: 'Type',
        width: 110,
        renderCell: (p: GridRenderCellParams<Row>) => (
          <DecisionChip type={p.value as string} size="small" />
        ),
      },
      {
        field: 'ticker',
        headerName: 'Symbol',
        width: 130,
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
        width: 120,
        renderCell: (p: GridRenderCellParams<Row>) => <RelativeDate date={p.value as string} />,
      },
      {
        field: 'currentPrice',
        headerName: 'Current price',
        width: 120,
        renderCell: (p: GridRenderCellParams<Row>) =>
          p.value != null ? (
            <Typography variant="body2">{(p.value as number).toFixed(2)}</Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">—</Typography>
          ),
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
              <MarkdownRender source={getEntryDisplayTitle({ title_markdown: entryVal.title_markdown }, [p.row])} inline dense />
            </Link>
          )
        },
      },
      {
        field: 'id',
        headerName: '',
        width: 110,
        sortable: false,
        renderCell: (p: GridRenderCellParams<Row>) =>
          !p.row.outcome ? (
            <Link
              component="button"
              variant="body2"
              onClick={() => setOutcomeDialogAction(p.row)}
              sx={{ cursor: 'pointer' }}
            >
              Add outcome
            </Link>
          ) : null,
      },
    ],
    [openChart]
  )

  // Hide some columns on mobile
  const columnVisibilityModel: GridColumnVisibilityModel = isMobile
    ? { currentPrice: false, oppReturnPct: false, reason: false, entry: false }
    : {}

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        Actions
      </Typography>

      <Box display="flex" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }} variant="outlined">
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
          renderInput={(params) => <TextField {...params} label="Ticker" sx={{ minWidth: 160 }} />}
          clearOnEscape
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
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography color="text.secondary" variant="body2">
            No actions yet. Start by creating a journal entry and adding a Buy/Sell decision.
          </Typography>
        </Box>
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
            '& .MuiDataGrid-cell': { alignItems: 'center', display: 'flex' },
            '& .MuiDataGrid-columnHeader': { bgcolor: 'background.default' },
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
            // Close immediately — refresh list in background.
            setOutcomeDialogAction(null)
            getOutcomesForActionIds([outcomeDialogAction.id]).then((list) => {
              setOutcomesByActionId((prev) => {
                const next = { ...prev }
                list.forEach((o) => { next[o.action_id] = o })
                return next
              })
            })
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save outcome')
          }
        }}
      />
    </Box>
  )
}
