import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Alert,
  Chip,
  TextField,
  InputAdornment,
  Skeleton,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef, GridRenderCellParams, GridRowParams } from '@mui/x-data-grid'
import { listActions, type ActionWithEntry } from '../services/actionsService'
import { listEntries } from '../services/entriesService'
import { listPassed } from '../services/passedService'
import { normalizeTickerToCompany } from '../utils/tickerCompany'
import { isAutomatedEntry } from '../utils/entryTitle'
import RelativeDate from '../components/RelativeDate'
import DecisionChip from '../components/DecisionChip'
import type { Passed } from '../types/database'
import { useTickerChart } from '../contexts/TickerChartContext'

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
  const [actions, setActions] = useState<ActionWithEntry[]>([])
  const [passedList, setPassedList] = useState<Passed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([listActions({ limit: 5000 }), listPassed(), listEntries({ limit: 10000 })])
      .then(([a, p, entries]) => {
        if (cancelled) return
        // Only show actions from real Journalytic entries, not auto-created IBKR ones.
        const autoIds = new Set((entries ?? []).filter(isAutomatedEntry).map((e) => e.id))
        setActions(a.filter((act) => !autoIds.has(act.entry_id)))
        setPassedList(p ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load ideas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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
      width: 120,
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
      minWidth: 120,
      renderCell: (p: GridRenderCellParams<IdeaRow>) =>
        (p.value as string) || p.row.ticker,
    },
    {
      field: 'lastDate',
      headerName: 'Last entry',
      width: 130,
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

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        Ideas
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tickers from your decisions. Click a row to open the idea page, or click the ticker chip for a quick chart.
      </Typography>

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
      ) : ideas.length === 0 ? (
        <Typography color="text.secondary">
          {search.trim()
            ? 'No ideas match your search.'
            : 'No ideas yet. Add Buy, Sell, or Pass decisions in journal entries to track tickers here. You can also add passed ideas directly from the Passed tab.'}
        </Typography>
      ) : (
        <DataGrid
          rows={ideas}
          columns={columns}
          density="compact"
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params: GridRowParams<IdeaRow>) => {
            navigate(`/ideas/${encodeURIComponent(params.row.ticker)}`)
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            cursor: 'pointer',
            '& .MuiDataGrid-cell': { alignItems: 'center', display: 'flex' },
            '& .MuiDataGrid-columnHeader': { bgcolor: 'background.default' },
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      )}
    </Box>
  )
}
