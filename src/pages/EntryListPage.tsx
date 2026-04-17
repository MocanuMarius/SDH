import { useEffect, useRef, useState, useMemo, memo } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Collapse,
  Divider,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  Fab,
  Zoom,
  Skeleton,
  Stack,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
// AddIcon removed — "+" is inline text in the button now
import SearchIcon from '@mui/icons-material/Search'
import CreateIcon from '@mui/icons-material/Create'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import ViewListIcon from '@mui/icons-material/ViewList'
import GridViewIcon from '@mui/icons-material/GridView'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import EditIcon from '@mui/icons-material/Edit'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RemoveIcon from '@mui/icons-material/Remove'
import LoopIcon from '@mui/icons-material/Loop'
import { countAutomatedEntries } from '../services/entriesService'
import type { EntryWithActions } from '../services/entriesService'
import { useDebounce } from '../hooks/useDebounce'
import { useEntriesWithActions } from '../hooks/queries'
import { getChartCategory } from '../theme/decisionTypes'
import PlainTextWithTickers from '../components/PlainTextWithTickers'
import RelativeDate from '../components/RelativeDate'
import TagChip from '../components/TagChip'
import { investmentScoreBadge } from '../utils/investmentScore'
import SwipeableCard from '../components/SwipeableCard'
import PullToRefresh from '../components/PullToRefresh'

/** Initial entries to load (6 rows × 4 cols) */
const INITIAL_PAGE_SIZE = 24
/** How many more to load per "Load more" click */
const LOAD_MORE_SIZE = 8
/** Desktop column count — used to insert row dividers */
const GRID_COLS = 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all unique $TICKER patterns from text — first char must be a letter to exclude prices like $41.00 */
function extractTickers(text: string): string[] {
  const matches = text.matchAll(/\$([A-Z][A-Z0-9.:]{0,9})/gi)
  const seen = new Set<string>()
  for (const m of matches) seen.add(`$${m[1].toUpperCase()}`)
  return Array.from(seen)
}

type BadgeCategory = 'buy' | 'sell' | 'cover' | 'other'

/** Map an action type to a badge category (cover is distinct from buy) */
function getBadgeCategory(type: string): BadgeCategory {
  if (type.toLowerCase() === 'cover') return 'cover'
  return getChartCategory(type)
}

/** Build ticker → badge category set from entry's actions */
function buildTickerActionMap(
  actions: EntryWithActions['actions']
): Map<string, Set<BadgeCategory>> {
  const map = new Map<string, Set<BadgeCategory>>()
  if (!actions?.length) return map
  for (const a of actions) {
    const key = `$${a.ticker.toUpperCase()}`
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)!.add(getBadgeCategory(a.type))
  }
  return map
}

/**
 * Resolve the effective investment score for an entry:
 *   - user's manual override takes precedence
 *   - otherwise the auto-computed value
 *   - null when neither has been set (unscored entry)
 */
function effectiveInvestmentScore(entry: { investment_score?: number | null; investment_score_override?: number | null }): number | null {
  return entry.investment_score_override ?? entry.investment_score ?? null
}

/**
 * Walk an entry's linked actions and pull the first outcome with a non-null
 * process_score. Used to render a tiny process-outcome pill on entry cards
 * Returns both scores so the pill can be coloured accordingly.
 *
 * Supabase's embedded-select is tricky: because `outcomes.action_id` has a
 * UNIQUE constraint, the relationship is detected as 1:1 and `outcomes` comes
 * back as a single object, not an array. Similarly if the join finds nothing
 * it can be null. We normalise both shapes here.
 */
function entryProcessOutcome(entry: EntryWithActions): { process: number | null; outcome: number | null } {
  const rawActions = entry.actions as unknown
  const actions = Array.isArray(rawActions) ? rawActions : rawActions ? [rawActions] : []
  for (const a of actions as Array<{ outcomes?: unknown }>) {
    const raw = a?.outcomes as unknown
    const outcomesList = Array.isArray(raw) ? raw : raw ? [raw] : []
    for (const o of outcomesList as Array<{ process_score?: number | null; outcome_score?: number | null }>) {
      if (o?.process_score != null || o?.outcome_score != null) {
        return { process: o?.process_score ?? null, outcome: o?.outcome_score ?? null }
      }
    }
  }
  return { process: null, outcome: null }
}

type InvestmentFilter = 'all' | 'spec' | 'mixed' | 'invest'

function matchesInvestmentFilter(score: number | null, filter: InvestmentFilter): boolean {
  if (filter === 'all') return true
  if (score == null) return false // unscored entries are hidden when a bucket is selected
  if (filter === 'spec') return score < 30
  if (filter === 'mixed') return score >= 30 && score < 70
  return score >= 70
}

/** Strip markdown and truncate body to first 200 chars */
function bodyPreview(body: string): string {
  const stripped = body
    .replace(/###?\s?/g, '')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > 200 ? `${stripped.slice(0, 200)}…` : stripped
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Two-dot pill showing the entry's process × outcome scores.
 *
 *   green dot = process ≥ 3 (decision was sound)
 *   red dot   = process < 3 (decision was poor)
 *   $+ / $-   = outcome positive / negative
 *
 * The dominant reinforcement signal is the first dot (process), not the
 * second (outcome). A green-process + red-outcome entry is a *good trade*
 * the user should celebrate — the framework's emotional-reinforcement rule.
 */
function ProcessOutcomeBadge({ process, outcome }: { process: number | null; outcome: number | null }) {
  if (process == null && outcome == null) return null
  const procHigh = (process ?? 0) >= 3
  const outHigh = (outcome ?? 0) >= 3
  const procColor = process == null ? '#94a3b8' : procHigh ? '#16a34a' : '#dc2626'
  const outColor = outcome == null ? '#94a3b8' : outHigh ? '#16a34a' : '#dc2626'
  const tooltip =
    process == null
      ? 'Not scored'
      : procHigh && !outHigh
        ? `Good process · bad outcome (score ${process}/${outcome ?? '—'}) — celebrate this, the framework says`
        : !procHigh && outHigh
          ? `Bad process · good outcome (score ${process}/${outcome ?? '—'}) — warning, lucky`
          : procHigh && outHigh
            ? `Good process · good outcome (score ${process}/${outcome ?? '—'})`
            : `Bad process · bad outcome (score ${process}/${outcome ?? '—'})`
  return (
    <Tooltip title={tooltip}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          px: 0.5,
          height: 18,
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: procColor }} />
        <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>
          P
        </Typography>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: outColor, ml: 0.25 }} />
        <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>
          O
        </Typography>
      </Box>
    </Tooltip>
  )
}

/**
 * Small investment-score pill. Tap-target friendly (min-height 20px),
 * colour-coded Spec/Mixed/Invest so you can scan a journal page at a glance.
 */
function InvestmentScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const { label, color } = investmentScoreBadge(score)
  return (
    <Tooltip
      title={
        score < 30
          ? 'Speculation — short-dated, thin thesis, or no writeup'
          : score < 70
            ? 'Mixed — some structure, some gaps'
            : 'Investment — detailed writeup + structure'
      }
    >
      <Chip
        label={label}
        size="small"
        variant="outlined"
        sx={{
          height: 20,
          fontSize: '0.7rem',
          fontWeight: 700,
          borderColor: color,
          color,
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    </Tooltip>
  )
}

/**
 * Action direction badge shown inline after a ticker:
 *   ↑ green   = bought / added
 *   ↓ red     = sold / shorted / trimmed
 *   ↺ teal    = covered (closed a short position)
 *   — neutral = passed / held / watched (no position change)
 * Multiple icons shown when multiple action types exist on the same ticker.
 */
function TickerActionBadge({ categories }: { categories: Set<BadgeCategory> }) {
  const hasBuy = categories.has('buy')
  const hasSell = categories.has('sell')
  const hasCover = categories.has('cover')
  const hasOther = categories.has('other')
  if (!hasBuy && !hasSell && !hasCover && !hasOther) return null
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', ml: '2px', verticalAlign: 'middle', gap: '1px' }}
    >
      {hasBuy && <ArrowUpwardIcon sx={{ fontSize: '0.85rem', color: '#16a34a' }} />}
      {hasSell && <ArrowDownwardIcon sx={{ fontSize: '0.85rem', color: '#dc2626' }} />}
      {hasCover && <LoopIcon sx={{ fontSize: '0.85rem', color: '#0891b2' }} />}
      {hasOther && !hasBuy && !hasSell && !hasCover && (
        <RemoveIcon sx={{ fontSize: '0.85rem', color: 'text.disabled' }} />
      )}
    </Box>
  )
}

/**
 * Grid card — collapsed shows ticker + buy/sell badge + date.
 * On expand, card overlays siblings via position:absolute so grid doesn't reflow.
 *
 * Two-state approach:
 *   `expanded`  — drives Collapse in/out animation
 *   `overlayed` — keeps card in absolute mode until Collapse finishes closing (onExited)
 *                 Prevents layout shift during the collapse animation.
 */
const EntryGridCard = memo(function EntryGridCard({ entry }: { entry: EntryWithActions }) {
  const [expanded, setExpanded] = useState(false)
  const [overlayed, setOverlayed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [reservedHeight, setReservedHeight] = useState(0)

  const allText = `${entry.title_markdown || ''} ${entry.body_markdown || ''}`
  const tickers = extractTickers(allText)
  const tickerActionMap = buildTickerActionMap(entry.actions)

  const handleToggle = () => {
    if (!expanded) {
      // Opening: freeze wrapper height, enter overlay mode
      if (wrapperRef.current) setReservedHeight(wrapperRef.current.offsetHeight)
      setOverlayed(true)
      setExpanded(true)
    } else {
      // Closing: collapse content but keep overlay until animation ends
      setExpanded(false)
    }
  }

  // Called by Collapse when the close animation fully completes
  const handleExited = () => setOverlayed(false)

  return (
    <Box
      ref={wrapperRef}
      sx={{
        position: 'relative',
        // Keep height frozen while overlay is active (both opening and closing animation)
        height: overlayed && reservedHeight > 0 ? reservedHeight : 'auto',
      }}
    >
      <Card
        variant="outlined"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.15s, box-shadow 0.2s',
          '&:hover': { borderColor: 'primary.main' },
          ...(overlayed
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 10,
                boxShadow: expanded ? 6 : 1,
                borderColor: expanded ? 'primary.main' : undefined,
              }
            : {
                position: 'relative',
              }),
        }}
      >
        {/* Always-visible collapsed header — primary click opens the entry; chevron toggles preview */}
        <CardActionArea component={RouterLink} to={`/entries/${entry.id}`} sx={{ flex: 'none' }}>
          <CardContent sx={{ pb: 1 }}>
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
              <Box flex={1} minWidth={0}>
                {tickers.length > 0 ? (
                  <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ mb: 0.25 }}>
                    {tickers.slice(0, 3).map((t) => (
                      <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                        <Typography variant="h6" component="span" fontWeight={700} color="primary.main">
                          {t}
                        </Typography>
                        <TickerActionBadge categories={tickerActionMap.get(t) ?? new Set()} />
                      </Box>
                    ))}
                    {tickers.length > 3 && (
                      <Chip
                        label={`+${tickers.length - 3}`}
                        size="small"
                        variant="outlined"
                        sx={{ alignSelf: 'center', height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" fontWeight={600} noWrap component="div" sx={{ mb: 0.25 }}>
                    <PlainTextWithTickers source={entry.title_markdown || '(Untitled)'} inline dense tickerAsLink={false} />
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  <RelativeDate date={entry.date} sx={{ color: 'inherit' }} />
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <ProcessOutcomeBadge {...entryProcessOutcome(entry)} />
                <InvestmentScoreBadge score={effectiveInvestmentScore(entry)} />
                {/* Tooltip preview chevron — stops propagation so clicking it doesn't navigate */}
                <Tooltip title={expanded ? 'Hide preview' : 'Show preview'}>
                  <Box
                    component="span"
                    role="button"
                    tabIndex={0}
                    aria-label={expanded ? 'Hide preview' : 'Show preview'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggle() }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleToggle() } }}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      color: 'text.secondary',
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s, background-color 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <ExpandMoreIcon fontSize="small" />
                  </Box>
                </Tooltip>
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>

        {/* Expanded details */}
        <Collapse in={expanded} timeout="auto" unmountOnExit onExited={handleExited}>
          <CardContent sx={{ pt: 0, pb: 1.5 }}>
            {/* Full title when tickers are shown in header */}
            {tickers.length > 0 && (
              <Typography variant="body2" fontWeight={600} component="div" sx={{ mb: 0.75 }}>
                <PlainTextWithTickers source={entry.title_markdown || '(Untitled)'} inline dense tickerAsLink={false} />
              </Typography>
            )}

            {/* Tags */}
            {entry.tags.length > 0 && (
              <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mb: 0.75 }}>
                {entry.tags.map((t) => (
                  <TagChip key={t} tag={t} sx={{ pointerEvents: 'none' }} />
                ))}
              </Box>
            )}

            {/* Body preview */}
            {entry.body_markdown && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontSize: '0.8rem', lineHeight: 1.5 }}>
                {bodyPreview(entry.body_markdown)}
              </Typography>
            )}

            {/* Open + Edit buttons */}
            <Box display="flex" sx={{ borderRadius: 1, overflow: 'hidden' }}>
              <Button
                component={RouterLink}
                to={`/entries/${entry.id}`}
                size="small"
                variant="contained"
                disableElevation
                startIcon={<OpenInNewIcon fontSize="small" />}
                sx={{ flex: 1, textTransform: 'none', borderRadius: '4px 0 0 4px' }}
              >
                Open
              </Button>
              <Tooltip title="Edit entry">
                <Button
                  component={RouterLink}
                  to={`/entries/${entry.id}/edit`}
                  size="small"
                  variant="contained"
                  disableElevation
                  aria-label="Edit"
                  sx={{
                    textTransform: 'none',
                    borderRadius: '0 4px 4px 0',
                    borderLeft: '1px solid rgba(255,255,255,0.3)',
                    minWidth: 36,
                    px: 1,
                  }}
                >
                  <EditIcon fontSize="small" />
                </Button>
              </Tooltip>
            </Box>
          </CardContent>
        </Collapse>
      </Card>
    </Box>
  )
})

/** List-mode row — swipe left on mobile to reveal Open/Edit actions */
const EntryListRow = memo(function EntryListRow({ entry }: { entry: EntryWithActions }) {
  const allText = `${entry.title_markdown || ''} ${entry.body_markdown || ''}`
  const tickers = extractTickers(allText)
  const tickerActionMap = buildTickerActionMap(entry.actions)
  const navigate = useNavigate()

  const content = (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
        <Typography variant="body2" fontWeight={600} component="div" sx={{ flex: 1, minWidth: 0 }}>
          <PlainTextWithTickers source={entry.title_markdown || '(Untitled)'} inline dense tickerAsLink={false} />
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <ProcessOutcomeBadge {...entryProcessOutcome(entry)} />
          <InvestmentScoreBadge score={effectiveInvestmentScore(entry)} />
        </Box>
      </Box>
      {tickers.length > 0 && (
        <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ mt: 0.25 }}>
          {tickers.slice(0, 5).map((t) => (
            <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <Typography variant="caption" fontWeight={700} color="primary.main">{t}</Typography>
              <TickerActionBadge categories={tickerActionMap.get(t) ?? new Set()} />
            </Box>
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">
        <RelativeDate date={entry.date} sx={{ color: 'inherit' }} />
      </Typography>
    </Box>
  )

  return (
    <SwipeableCard
      actions={[
        { icon: <OpenInNewIcon sx={{ fontSize: 18 }} />, label: 'Open', onClick: () => navigate(`/entries/${entry.id}`), color: '#2563eb' },
        { icon: <EditIcon sx={{ fontSize: 18 }} />, label: 'Edit', onClick: () => navigate(`/entries/${entry.id}/edit`), color: '#475569' },
      ]}
    >
      <Box
        onClick={() => navigate(`/entries/${entry.id}`)}
        sx={{ cursor: 'pointer' }}
      >
        {content}
      </Box>
    </SwipeableCard>
  )
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntryListPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [hideAutomated, setHideAutomated] = useState(true)
  const [_automatedHiddenCount, setAutomatedHiddenCount] = useState<number | null>(null)
  const [investmentFilter, setInvestmentFilter] = useState<InvestmentFilter>('all')
  const [pageSize, setPageSize] = useState(INITIAL_PAGE_SIZE)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [gridView, setGridView] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── react-query: shared cache, auto-refetches when entries change anywhere ──
  const entriesQ = useEntriesWithActions({ search: debouncedSearch || undefined, limit: pageSize, hideAutomated })
  const entries: EntryWithActions[] = entriesQ.data ?? []
  const loading = entriesQ.isLoading
  // Surface query errors via the existing alert
  useEffect(() => {
    if (entriesQ.error) setError((entriesQ.error as Error).message ?? 'Failed to load entries')
  }, [entriesQ.error])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Fetch the count of auto-imported entries once so we can surface
  // "N automated entries hidden" next to the Hide automated checkbox.
  useEffect(() => {
    let cancelled = false
    countAutomatedEntries()
      .then((n) => { if (!cancelled) setAutomatedHiddenCount(n) })
      .catch(() => { if (!cancelled) setAutomatedHiddenCount(null) })
    return () => { cancelled = true }
  }, [])

  const handlePullRefresh = async () => {
    await entriesQ.refetch()
  }

  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.tags))).sort(),
    [entries]
  )

  // Automated entries are filtered server-side. Client filters: tag + investment bucket.
  const filteredEntries = useMemo(
    () =>
      entries.filter((e) => {
        if (tagFilter.length > 0 && !tagFilter.some((t) => e.tags.includes(t))) return false
        if (!matchesInvestmentFilter(effectiveInvestmentScore(e), investmentFilter)) return false
        return true
      }),
    [entries, tagFilter, investmentFilter]
  )

  /** Counts per investment bucket across the (tag-filtered) entries — used on the filter pill. */
  const bucketCounts = useMemo(() => {
    const counts = { all: 0, spec: 0, mixed: 0, invest: 0, unscored: 0 }
    for (const e of entries) {
      if (tagFilter.length > 0 && !tagFilter.some((t) => e.tags.includes(t))) continue
      counts.all += 1
      const s = effectiveInvestmentScore(e)
      if (s == null) counts.unscored += 1
      else if (s < 30) counts.spec += 1
      else if (s < 70) counts.mixed += 1
      else counts.invest += 1
    }
    return counts
  }, [entries, tagFilter])

  /** Build grid items with a Divider after every GRID_COLS cards (one desktop row) */
  const gridItems = useMemo(
    () =>
      filteredEntries.flatMap((entry, i) => {
        const card = (
          <Grid key={entry.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <EntryGridCard entry={entry} />
          </Grid>
        )
        const isEndOfRow = (i + 1) % GRID_COLS === 0 && i < filteredEntries.length - 1
        if (!isEndOfRow) return [card]
        return [
          card,
          <Grid key={`divider-${i}`} size={{ xs: 12 }}>
            <Divider sx={{ opacity: 0.35, my: 0.25 }} />
          </Grid>,
        ]
      }),
    [filteredEntries]
  )

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
    <Box>
      {/* ── FIXED HEADER: stays visible while list scrolls underneath ── */}
      <Box
        sx={{
          position: 'sticky',
          top: { xs: 56, sm: 64 },
          zIndex: 10,
          bgcolor: 'background.default',
          pb: 1,
          pt: 0.25,
          mx: { xs: -1.5, sm: -2 },
          px: { xs: 1.5, sm: 2 },
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Row 1: title + toggle + new */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Typography variant="h1" sx={{ flex: 1, mt: 0.5 }}>Journal</Typography>
          <ToggleButtonGroup
            value={gridView ? 'grid' : 'list'}
            exclusive
            size="small"
            onChange={(_, v) => { if (v !== null) setGridView(v === 'grid') }}
            sx={{ '& .MuiToggleButton-root': { px: 0.5, py: 0.35 } }}
          >
            <ToggleButton value="grid"><GridViewIcon sx={{ fontSize: 16 }} /></ToggleButton>
            <ToggleButton value="list"><ViewListIcon sx={{ fontSize: 16 }} /></ToggleButton>
          </ToggleButtonGroup>
          <Button
            component={RouterLink}
            to="/entries/new"
            variant="contained"
            size="small"
            sx={{ textTransform: 'none', py: 0.35, px: 1.5, fontSize: '0.8rem', minHeight: 0 }}
          >
            + New
          </Button>
        </Box>

        {/* Row 2: search */}
        <TextField
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment>,
            sx: { height: 32, fontSize: '0.85rem' },
          }}
          sx={{ mb: 0.5 }}
        />

        {/* Row 3: filters — investment buckets + auto toggle + tag select */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexWrap: 'wrap',
            '& .MuiToggleButton-root': { height: 26, fontSize: '0.65rem', px: 0.5, textTransform: 'none' },
          }}
        >
          <ToggleButtonGroup
            value={investmentFilter}
            exclusive
            size="small"
            onChange={(_, v) => { if (v !== null) setInvestmentFilter(v as InvestmentFilter) }}
          >
            <Tooltip
              title={
                bucketCounts.unscored > 0
                  ? `All ${bucketCounts.all} entries (${bucketCounts.spec} spec + ${bucketCounts.mixed} mixed + ${bucketCounts.invest} invest + ${bucketCounts.unscored} unscored)`
                  : 'All entries'
              }
            >
              <ToggleButton value="all">All {bucketCounts.all}</ToggleButton>
            </Tooltip>
            <Tooltip title="Speculation: short-dated, thin thesis, or no writeup">
              <ToggleButton value="spec" sx={{ color: '#dc2626' }}>S {bucketCounts.spec}</ToggleButton>
            </Tooltip>
            <Tooltip title="Mixed: some structure, some gaps">
              <ToggleButton value="mixed" sx={{ color: '#ca8a04' }}>M {bucketCounts.mixed}</ToggleButton>
            </Tooltip>
            <Tooltip title="Investment: detailed writeup + structure">
              <ToggleButton value="invest" sx={{ color: '#16a34a' }}>I {bucketCounts.invest}</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
          <Tooltip title={hideAutomated ? 'Currently hiding broker-imported entries — click to show them' : 'Currently showing broker-imported entries — click to hide them'}>
            <Chip
              size="small"
              label={hideAutomated ? 'Hide automated' : 'Show automated'}
              onClick={() => setHideAutomated((v) => !v)}
              variant={hideAutomated ? 'filled' : 'outlined'}
              sx={{ height: 26, fontSize: '0.65rem' }}
            />
          </Tooltip>
          {allTags.length > 0 && (
            <Autocomplete
              multiple
              size="small"
              options={allTags}
              value={tagFilter}
              onChange={(_, v) => setTagFilter(v)}
              disableCloseOnSelect
              renderTags={() => (
                tagFilter.length > 0
                  ? <Chip size="small" label={`${tagFilter.length} tag${tagFilter.length > 1 ? 's' : ''}`} sx={{ height: 22, fontSize: '0.65rem' }} />
                  : null
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={tagFilter.length === 0 ? 'Tags' : ''}
                  sx={{
                    '& .MuiInputBase-root': {
                      height: 26,
                      minHeight: 26,
                      fontSize: '0.7rem',
                      py: 0,
                      display: 'flex',
                      alignItems: 'center',
                    },
                    '& .MuiInputBase-input': {
                      py: '2px !important',
                      lineHeight: 1,
                    },
                  }}
                />
              )}
              sx={{ minWidth: 80, flex: 1 }}
            />
          )}
        </Box>
      </Box>
      {/* ── End fixed header ── */}

      {error && (
        <Alert severity="error" sx={{ mb: 1, mt: 0.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Content ── */}
      {loading ? (
        gridView ? (
          <Grid container spacing={1} sx={{ alignItems: 'flex-start' }}>
            {Array.from({ length: INITIAL_PAGE_SIZE }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Skeleton variant="text" width="50%" height={32} />
                    <Skeleton variant="text" width="40%" height={18} sx={{ mt: 0.5 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Stack spacing={1.5}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} variant="outlined">
                <CardContent sx={{ py: 1.5 }}>
                  <Skeleton variant="text" width="60%" height={24} />
                  <Skeleton variant="text" width="30%" height={18} sx={{ mt: 0.5 }} />
                </CardContent>
              </Card>
            ))}
          </Stack>
        )
      ) : filteredEntries.length === 0 ? (
        <Typography color="text.secondary">
          {entries.length === 0
            ? 'No entries yet. Create one to get started.'
            : 'No entries match the current filters.'}
        </Typography>
      ) : gridView ? (
        <Grid container spacing={1} sx={{ alignItems: 'flex-start' }}>
          {gridItems}
        </Grid>
      ) : (
        <Stack spacing={0.75}>
          {filteredEntries.map((entry) => (
            <EntryListRow key={entry.id} entry={entry} />
          ))}
        </Stack>
      )}

      {/* ── Load more ── */}
      {!loading && filteredEntries.length > 0 && entries.length >= pageSize && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Button variant="outlined" onClick={() => setPageSize((prev) => prev + LOAD_MORE_SIZE)}>
            Load more
          </Button>
        </Box>
      )}

      {/* ── FABs ── */}
      <Fab
        color="primary"
        aria-label="Start writing"
        component={RouterLink}
        to="/entries/new"
        sx={{
          position: 'fixed',
          // On mobile, sit above the 56px bottom nav; on desktop, use safe-area only
          bottom: { xs: 72, sm: 'max(16px, env(safe-area-inset-bottom))' },
          right: { xs: 16, sm: 24 },
        }}
      >
        <CreateIcon />
      </Fab>

      <Zoom in={showScrollTop}>
        <Fab
          color="default"
          size="small"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          sx={{
            position: 'fixed',
            bottom: { xs: 72, sm: 'max(16px, env(safe-area-inset-bottom))' },
            right: { xs: 80, sm: 100 },
          }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      </Zoom>
    </Box>
    </PullToRefresh>
  )
}
