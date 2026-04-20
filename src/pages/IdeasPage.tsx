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
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import { useTickerChart } from '../contexts/TickerChartContext'
import { useActions, usePassed } from '../hooks/queries'
import { PageHeader, EmptyState } from '../components/system'
import { useCyclingPlaceholder } from '../hooks/useCyclingPlaceholder'

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
  const [searchFocused, setSearchFocused] = useState(false)
  const searchPlaceholder = useCyclingPlaceholder(
    ['Search by ticker…', 'Search by company…', 'e.g. AAPL, Tesla, $NVDA'],
    { paused: searchFocused || search.length > 0 },
  )
  const theme = useTheme()
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'))
  const [error, setError] = useState<string | null>(null)

  // ─── react-query: actions + passed are shared across pages ──
  const actionsQ = useActions({ limit: 5000 })
  const passedQ = usePassed()
  const loading = actionsQ.isLoading || passedQ.isLoading
  const queryError = actionsQ.error || passedQ.error
  const errorMessage = error ?? (queryError ? (queryError as Error).message : null)

  // Used to filter out actions from broker-imported entries; no longer
  // needed — the user keeps decisions manually now.
  const actions = useMemo(() => actionsQ.data ?? [], [actionsQ.data])
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
      // 88 px was eating tickers with suffixes like $MTX.DE → $MTX...
      // 108 fits the longest realistic ticker shape.
      width: isMobile ? 108 : 120,
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
      // Was falling back to `p.row.ticker` when no company name was set,
      // which duplicated the ticker on most rows ("$CRC | CRC", "$AMD |
      // AMD"). Now we just render the company name when present and a
      // muted dash when not — the ticker chip in the column to the
      // left is the source of truth.
      renderCell: (p: GridRenderCellParams<IdeaRow>) => {
        const value = (p.value as string)?.trim()
        return value && value.toUpperCase() !== p.row.ticker.toUpperCase()
          ? value
          : <span style={{ color: 'var(--mui-palette-text-disabled, #94a3b8)' }}>—</span>
      },
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

      {/* Sticky on mobile under the PageHeader (which sticks at 56px
          under the AppBar and is ~46px tall dense ⇒ search stick at
          102px). Matches PageHeader's edge-bleed bg + hairline border
          so it reads as a second "you are here" strip while scrolling
          a long tickers list. On desktop it's just a normal inline
          input. */}
      <Box
        sx={{
          position: { xs: 'sticky', sm: 'static' },
          top: { xs: 102, sm: 'auto' },
          zIndex: { xs: 4, sm: 'auto' },
          bgcolor: { xs: 'background.default', sm: 'transparent' },
          borderBottom: { xs: '1px solid', sm: 'none' },
          borderColor: { xs: 'divider', sm: 'transparent' },
          mx: { xs: -1.5, sm: 0 },
          px: { xs: 1.5, sm: 0 },
          py: { xs: 0.75, sm: 0 },
          mb: 2,
        }}
      >
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          fullWidth
          sx={{ maxWidth: { xs: '100%', sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

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
          description={search.trim()
            ? undefined
            : 'Tickers show up here once you log a decision against them — buy / sell / pass / research. From the journal, mention a $TICKER in an entry and add a decision; the ticker will land here automatically.'}
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
