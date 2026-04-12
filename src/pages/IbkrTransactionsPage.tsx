import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CardContent,
  Link,
  Chip,
} from '@mui/material'
import { listIbkrTransactions } from '../services/ibkrTransactionsService'
import type { IbkrTransaction } from '../services/ibkrTransactionsService'
import type { IbkrActivitySummaryResponse, IbkrActivityStatement, IbkrActivityAccount } from '../types/ibkrActivity'
import { normalizeTickerToCompany } from '../utils/tickerCompany'

const ACTIVITY_JSON_URL = '/data/ibkr-activity-summary.json'

function formatNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n >= 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : `(${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
}

export default function IbkrTransactionsPage() {
  const [transactions, setTransactions] = useState<IbkrTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [symbolFilter, setSymbolFilter] = useState('')

  const [activitySummary, setActivitySummary] = useState<IbkrActivitySummaryResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [selectedStatementIdx, setSelectedStatementIdx] = useState(0)
  const [selectedAccountIdx, setSelectedAccountIdx] = useState(0)

  useEffect(() => {
    const cancelled = { current: false }
    setLoading(true)
    listIbkrTransactions({
      transaction_type: typeFilter || undefined,
      symbol: symbolFilter || undefined,
      limit: 500,
    })
      .then((data) => {
        if (!cancelled.current) setTransactions(data)
      })
      .catch((e) => {
        if (!cancelled.current) setError(e.message ?? 'Failed to load')
      })
      .finally(() => {
        if (!cancelled.current) setLoading(false)
      })
    return () => { cancelled.current = true }
  }, [typeFilter, symbolFilter])

  useEffect(() => {
    let cancelled = false
    setActivityLoading(true)
    setActivityError(null)
    fetch(ACTIVITY_JSON_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Activity data not found'))))
      .then((data: IbkrActivitySummaryResponse) => {
        if (!cancelled) setActivitySummary(data)
      })
      .catch((e) => {
        if (!cancelled) setActivityError(e?.message ?? 'Failed to load activity summary')
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const symbols = Array.from(new Set(transactions.map((t) => t.symbol).filter(Boolean))).sort()

  const statement: IbkrActivityStatement | null = activitySummary?.statements?.[selectedStatementIdx] ?? null
  const account: IbkrActivityAccount | null = statement?.accounts?.[selectedAccountIdx] ?? null

  return (
    <Box>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        Broker transaction history and activity insights from your IBKR statements. Run <code>npm run parse:ibkr</code> after adding new HTML to <code>data/private/ibkr-raw/</code>.
      </Typography>

      {/* Activity insights */}
      {activityLoading && (
        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Loading activity insights…</Typography>
        </Box>
      )}
      {activityError && !activitySummary && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No activity insights yet. Export activity statements from IBKR (Reports → Activity Statement), save the HTML in <code>data/private/ibkr-raw/</code>, then run <code>npm run parse:ibkr</code>.
        </Alert>
      )}
      {activitySummary && activitySummary.statements.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Activity insights
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Statement</InputLabel>
              <Select
                value={selectedStatementIdx}
                label="Statement"
                onChange={(e) => {
                  setSelectedStatementIdx(Number(e.target.value))
                  setSelectedAccountIdx(0)
                }}
              >
                {activitySummary.statements.map((s, i) => (
                  <MenuItem key={i} value={i}>
                    {s.period || s.file}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {statement && statement.accounts.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Account</InputLabel>
                <Select
                  value={selectedAccountIdx}
                  label="Account"
                  onChange={(e) => setSelectedAccountIdx(Number(e.target.value))}
                >
                  {statement.accounts.map((a, i) => (
                    <MenuItem key={i} value={i}>
                      {a.accountId}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {statement?.accountSummary && statement.accountSummary.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
              {statement.accountSummary.map((row) => (
                <Card key={row.account} variant="outlined" sx={{ minWidth: 180 }}>
                  <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{row.account} · {row.alias}</Typography>
                    <Typography variant="body2" fontWeight={600}>Prior NAV {formatNum(row.priorNav)}</Typography>
                    <Typography variant="body2">Current NAV {formatNum(row.currentNav)}</Typography>
                    {row.twr != null && (
                      <Chip size="small" label={`TWR ${row.twr}`} sx={{ mt: 0.5 }} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {account && Object.keys(account.changeInNav).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Change in NAV</Typography>
              <Box display="flex" flexWrap="wrap" gap={2}>
                {['starting_value', 'ending_value', 'mark_to_market', 'dividends', 'interest', 'commissions', 'deposits_withdrawals', 'position_transfers'].map((key) => {
                  const entry = account.changeInNav[key]
                  if (!entry) return null
                  return (
                    <Typography key={key} variant="body2">
                      <strong>{entry.label}:</strong> {formatNum(entry.value)}
                    </Typography>
                  )
                })}
              </Box>
            </Box>
          )}

          {account && account.mtmStocks.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Mark-to-market by symbol (Stocks)</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell align="right">Position P/L</TableCell>
                      <TableCell align="right">Transaction P/L</TableCell>
                      <TableCell align="right">Commissions</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {account.mtmStocks.map((row) => (
                      <TableRow key={row.symbol}>
                        <TableCell>
                          <Link component={RouterLink} to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(row.symbol) || row.symbol)}`} underline="hover">
                            {row.symbol}
                          </Link>
                        </TableCell>
                        <TableCell align="right">{formatNum(row.positionPL)}</TableCell>
                        <TableCell align="right">{formatNum(row.transactionPL)}</TableCell>
                        <TableCell align="right">{formatNum(row.commissions)}</TableCell>
                        <TableCell align="right">
                          <Typography component="span" color={row.total != null && row.total < 0 ? 'error.main' : 'text.primary'}>
                            {formatNum(row.total)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {account && account.realizedUnrealizedStocks.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Realized &amp; unrealized by symbol (Stocks)</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Symbol</TableCell>
                      <TableCell align="right">Realized</TableCell>
                      <TableCell align="right">Unrealized</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {account.realizedUnrealizedStocks.map((row) => (
                      <TableRow key={row.symbol}>
                        <TableCell>
                          <Link component={RouterLink} to={`/ideas/${encodeURIComponent(normalizeTickerToCompany(row.symbol) || row.symbol)}`} underline="hover">
                            {row.symbol}
                          </Link>
                        </TableCell>
                        <TableCell align="right">
                          <Typography component="span" color={row.realizedTotal != null && row.realizedTotal < 0 ? 'error.main' : 'text.primary'}>
                            {formatNum(row.realizedTotal)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography component="span" color={row.unrealizedTotal != null && row.unrealizedTotal < 0 ? 'error.main' : 'text.primary'}>
                            {formatNum(row.unrealizedTotal)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography component="span" color={row.total != null && row.total < 0 ? 'error.main' : 'text.primary'}>
                            {formatNum(row.total)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Paper>
      )}

      {/* Transactions table */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Transactions
      </Typography>
      <Box display="flex" gap={1.5} flexWrap="wrap" sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }} variant="outlined">
          <InputLabel>Type</InputLabel>
          <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="Buy">Buy</MenuItem>
            <MenuItem value="Sell">Sell</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }} variant="outlined">
          <InputLabel>Symbol</InputLabel>
          <Select value={symbolFilter} label="Symbol" onChange={(e) => setSymbolFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {symbols.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : transactions.length === 0 ? (
        <Typography color="text.secondary">
          No IBKR transactions. Run <code>npm run import:data</code> after adding IMPORT_USER_EMAIL and
          IMPORT_USER_PASSWORD to .env.local, and apply migrations (npx supabase db push).
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell>Currency</TableCell>
                <TableCell align="right">Net amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.tx_date}</TableCell>
                  <TableCell>{row.transaction_type}</TableCell>
                  <TableCell>{row.symbol || '—'}</TableCell>
                  <TableCell align="right">{row.quantity != null ? row.quantity : '—'}</TableCell>
                  <TableCell align="right">{row.price != null ? row.price : '—'}</TableCell>
                  <TableCell>{row.price_currency || '—'}</TableCell>
                  <TableCell align="right">
                    {row.net_amount != null ? row.net_amount.toFixed(2) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}
