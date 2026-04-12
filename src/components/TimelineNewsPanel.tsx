/**
 * TimelineNewsPanel — collapsible "News in this period" card that hangs below the
 * Timeline chart. Reacts to the currently selected ticker + date range (zoom brush
 * or measure-selection). Renders at most 5 items from /api/news, ranked by
 * recency × publisher weight.
 *
 * Copyright: we only render headline + publisher + relative date + source link.
 * No article bodies are fetched or displayed.
 */

import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import NewspaperIcon from '@mui/icons-material/Newspaper'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { fetchNewsForPeriod, clearNewsCache } from '../services/newsService'
import type { NewsItem } from '../services/newsService'

interface Props {
  /** Empty / 'SPY' / 'MARKET' → market-wide news. Otherwise per-ticker. */
  symbol: string
  /** YYYY-MM-DD inclusive. If null, defaults to open-ended on that side. */
  fromDate: string | null
  /** YYYY-MM-DD inclusive. */
  toDate: string | null
  /** Optional label for the selection source (e.g. 'zoom', 'measure'). */
  selectionLabel?: string
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const now = Date.now()
  const diffMs = now - then
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) return new Date(iso).toLocaleDateString()
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return new Date(iso).toLocaleDateString()
}

export default function TimelineNewsPanel({ symbol, fromDate, toDate, selectionLabel }: Props) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  // Cache key in the form the parent passes — used to skip refetches.
  const key = `${symbol || ''}|${fromDate || ''}|${toDate || ''}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchNewsForPeriod({
      symbol: symbol || '',
      from: fromDate || '',
      to: toDate || '',
      limit: 5,
    })
      .then((data) => {
        if (cancelled) return
        setItems(data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load news')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const handleRefresh = () => {
    clearNewsCache()
    setItems([])
    setLoading(true)
    fetchNewsForPeriod({
      symbol: symbol || '',
      from: fromDate || '',
      to: toDate || '',
      limit: 5,
    })
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load news'))
      .finally(() => setLoading(false))
  }

  const isMarket = !symbol || symbol.toUpperCase() === 'SPY' || symbol.toUpperCase() === 'MARKET'
  const subject = isMarket ? 'Market' : `$${symbol.toUpperCase()}`
  const rangeLabel =
    fromDate && toDate
      ? `${fromDate} → ${toDate}`
      : fromDate
        ? `from ${fromDate}`
        : toDate
          ? `through ${toDate}`
          : 'all time'

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <NewspaperIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight={700}>
          {subject} news — {rangeLabel}
        </Typography>
        {selectionLabel && (
          <Chip label={selectionLabel} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
        )}
        {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
        <Box sx={{ flex: 1 }} />
        {!loading && items.length > 0 && (
          <Chip
            label={`${items.length} ${items.length === 1 ? 'story' : 'stories'}`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        )}
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              handleRefresh()
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent sx={{ pt: 0 }}>
          {error && (
            <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {!loading && items.length === 0 && !error && (
            <Typography variant="caption" color="text.secondary">
              No stories found for this period.{' '}
              {fromDate && new Date(fromDate).getTime() < Date.now() - 30 * 86400000 && (
                <>
                  Historical news older than ~30 days requires <code>FINNHUB_API_KEY</code> in <code>.env.local</code> —
                  free at <Link href="https://finnhub.io" target="_blank" rel="noreferrer">finnhub.io</Link>.
                </>
              )}
            </Typography>
          )}
          <Stack spacing={1}>
            {items.map((item, i) => (
              <Box
                key={`${item.url}-${i}`}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  p: 1,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      color: 'text.primary',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    {item.title}
                    <OpenInNewIcon sx={{ fontSize: '0.9rem', opacity: 0.5 }} />
                  </Link>
                  <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {item.publisher}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      · {relativeDate(item.publishedAt)}
                    </Typography>
                    <Chip
                      label={item.source}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 16,
                        fontSize: '0.6rem',
                        opacity: 0.7,
                        '& .MuiChip-label': { px: 0.5 },
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Collapse>
    </Card>
  )
}
