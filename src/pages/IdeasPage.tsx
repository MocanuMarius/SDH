import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Alert,
  Chip,
  TextField,
  InputAdornment,
  Skeleton,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef, GridColumnVisibilityModel, GridRenderCellParams, GridRowParams } from '@mui/x-data-grid'
import { normalizeTickerToCompany } from '../utils/tickerCompany'
import { isAutomatedEntry } from '../utils/entryTitle'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { useTickerChart } from '../contexts/TickerChartContext'
import { useActions, useEntries, usePassed } from '../hooks/queries'
import { PageHeader, EmptyState } from '../components/system'

interface IdeaRow {
  id: string // DataGrid requires an id field
  ticker: string
  /** Most recent raw ticker (may include exchange suffix like CSU:TO) — used for exact DB queries */
  rawTicker: string
  company: string
  lastDate: string
  decisionCount: number
  isPassed: boolean
  passedOnly?: boolean
}

export default function IdeasPage() {
  const navigate = useNavigate()
  const { openChart } = useTickerChart()
  const [search, setSearch] = useState('')
  const theme = useTheme()
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'))
  const [error, setError] = useState<string | null>(null)

  // ─── react-query: actions/passed/entries are shared across pages ──
  const actionsQ = useActions({ limit: 5000 })
  const passedQ = usePassed()
  const entriesQ = useEntries({ limit: 10000 })
  const loading = actionsQ.isLoading || passedQ.isLoading || entriesQ.isLoading
  const queryError = actionsQ.error || passedQ.error || entriesQ.error
  const errorMessage = error ?? (queryError ? (queryError as Error).message : null)

  // Filter out actions from auto-imported entries — same logic as before.
  const actions = useMemo(() => {
    const all = actionsQ.data ?? []
    const entries = entriesQ.data ?? []
    const autoIds = new Set(entries.filter(isAutomatedEntry).map((e) => e.id))
    // Standalone actions (entry_id null) can never be from an automated entry — keep them.
    return all.filter((act) => act.entry_id == null || !autoIds.has(act.entry_id))
  }, [actionsQ.data, entriesQ.data])
  // Stable reference for downstream useMemos.
  const passedList = useMemo(() => passedQ.data ?? [], [passedQ.data])

  const ideas = useMemo(() => {
    const byCompany: Record<string, {
      company: string
      lastDate: string
      rawTicker: string
      count: number
      isPassed: boolean
      passedOnly?: boolean
    }> = {}

    actions.forEach((a) => {
      if (!a.ticker?.trim()) return
      const t = a.ticker.trim()
      const companyKey = normalizeTickerToCompany(t) || t.toUpperCase()
      if (!byCompany[companyKey]) {
        byCompany[companyKey] = { company: a.company_name?.trim() ?? '', lastDate: a.action_date, rawTicker: t, count: 0, isPassed: false }
      }
      byCompany[companyKey].count += 1
      if (a.action_date > byCompany[companyKey].lastDate) {
        byCompany[companyKey].lastDate = a.action_date
        byCompany[companyKey].rawTicker = t
        byCompany[companyKey].company = a.company_name?.trim() ?? byCompany[companyKey].company
      }
    })

    passedList.forEach((p) => {
      const companyKey = normalizeTickerToCompany(p.ticker) || p.ticker.trim().toUpperCase() || '?'
      if (byCompany[companyKey]) {
        byCompany[companyKey].isPassed = true
        if (p.passed_date > byCompany[companyKey].lastDate) byCompany[companyKey].lastDate = p.passed_date
      } else {
        byCompany[companyKey] = { company: '', lastDate: p.passed_date, rawTicker: p.ticker?.trim().toUpperCase() || companyKey, count: 0, isPassed: true, passedOnly: true }
      }
    })

    const q = search.trim().toLowerCase()
    return Object.entries(byCompany)
      .map(([ticker, v]): IdeaRow => ({
        id: ticker,
        ticker,
        rawTicker: v.rawTicker ?? ticker,
        company: v.company,
        lastDate: v.lastDate,
        decisionCount: v.count,
        isPassed: v.isPassed,
        passedOnly: v.passedOnly,
      }))
      .filter(
        (i) =>
          !q ||
          i.ticker.toLowerCase().includes(q) ||
          i.company.toLowerCase().includes(q)
      )
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  }, [actions, passedList, search])

  const columns: GridColDef<IdeaRow>[] = [
    {
      field: 'ticker',
      headerName: '$',
      width: isMobile ? 88 : 120,
      renderCell: (p: GridRenderCellParams<IdeaRow>) => (
        <Chip
          size="small"
          label={`$${p.value as string}`}
          onClick={(e) => { e.stopPropagation(); openChart(p.row.rawTicker) }}
          clickable
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: 'company',
      headerName: 'Name',
      flex: 1,
      minWidth: isMobile ? 100 : 140,
      renderCell: (p: GridRenderCellParams<IdeaRow>) =>
        (p.value as string) || p.row.ticker,
    },
    {
      field: 'lastDate',
      headerName: 'Last entry',
      width: isMobile ? 100 : 130,
      renderCell: (p: GridRenderCellParams<IdeaRow>) => (
        <RelativeDate date={p.value as string} />
      ),
    },
    {
      field: 'decisionCount',
      headerName: 'Decisions',
      type: 'number',
      width: 100,
    },
    {
      field: 'isPassed',
      headerName: 'Status',
      width: 130,
      renderCell: (p: GridRenderCellParams<IdeaRow>) => {
        if (p.row.passedOnly)
          return <Chip size="small" label="Passed only" variant="outlined" sx={{ fontStyle: 'italic' }} />
        if (p.value)
          return <DecisionChip type="pass" label="Passed" size="medium" variant="outlined" />
        return null
      },
    },
  ]

  // On mobile (Pixel 8 ~ 412px) we drop Decisions count and Status to make
  // room for $, Name, Last entry — the three users actually scan for.
  const columnVisibilityModel: GridColumnVisibilityModel = isMobile
    ? { decisionCount: false, isPassed: false }
    : {}

  return (
    <Box>
      <PageHeader title="Tickers" dense />

      <TextField
        size="small"
        placeholder="Search ticker or company…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, maxWidth: 320 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {errorMessage}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : ideas.length === 0 ? (
        <EmptyState
          title={search.trim() ? 'No tickers match your search' : 'No tickers yet'}
        />
      ) : (
        <DataGrid
          rows={ideas}
          columns={columns}
          columnVisibilityModel={columnVisibilityModel}
          density="compact"
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params: GridRowParams<IdeaRow>) => {
            navigate(`/tickers/${encodeURIComponent(params.row.ticker)}`)
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            cursor: 'pointer',
            '& .MuiDataGrid-cell': {
              alignItems: 'center',
              display: 'flex',
              ...(isMobile && { paddingLeft: '6px', paddingRight: '6px' }),
            },
            '& .MuiDataGrid-columnHeader': {
              bgcolor: 'background.default',
              ...(isMobile && { paddingLeft: '6px', paddingRight: '6px' }),
            },
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      )}
    </Box>
  )
}
