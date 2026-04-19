import { useEffect, useState, useMemo, memo } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Autocomplete,
  Box,
  Button,
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
import SearchIcon from '@mui/icons-material/Search'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import EditIcon from '@mui/icons-material/Edit'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RemoveIcon from '@mui/icons-material/Remove'
import LoopIcon from '@mui/icons-material/Loop'
import type { EntryWithActions } from '../services/entriesService'
import { stripLegacyMarkdown } from '../utils/stripLegacyMarkdown'
import { useDebounce } from '../hooks/useDebounce'
import { useEntriesWithActions } from '../hooks/queries'
import { getChartCategory } from '../theme/decisionTypes'
import RelativeDate from '../components/RelativeDate'
import { investmentScoreBadge } from '../utils/investmentScore'
import SwipeableCard from '../components/SwipeableCard'
import PullToRefresh from '../components/PullToRefresh'
import { EmptyState } from '../components/system'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'

/** Initial entries to load — dense one-line rows, so we can fit more. */
const INITIAL_PAGE_SIZE = 50
/** How many more to load per "Load more" click */
const LOAD_MORE_SIZE = 25

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
 * Journal list row — one dense line per entry, newspaper-table style.
 *
 *   [$UBER ↑] [$CSU ↑]  Title prose here                3d ago  [M65]
 *
 * Layout (left → right):
 *  1. Tickers found in title + body (up to 3) with buy/sell badges.
 *  2. Title prose (the title minus any ticker mentions) — flex, ellipsed.
 *  3. Relative date — secondary colour, right-aligned, never wraps.
 *  4. ProcessOutcome + InvestmentScore badges, hidden on very narrow viewports.
 *
 * Swipe-left on mobile reveals Open / Edit actions (unchanged from before).
 * Hairline borderBottom between rows replaces the previous outlined-card
 * treatment per "hairlines, not boxes" in docs/PRINCIPLES.md.
 */
const EntryListRow = memo(function EntryListRow({ entry }: { entry: EntryWithActions }) {
  const allText = `${entry.title_markdown || ''} ${entry.body_markdown || ''}`
  const tickers = extractTickers(allText)
  const tickerActionMap = buildTickerActionMap(entry.actions)
  const navigate = useNavigate()

  // Title minus any ticker mentions — so "$UBER short speculation" shows
  // just "short speculation" as the title text (no duplicate ticker next
  // to the prominent left-side ticker chip). Collapse resulting whitespace.
  // Also strip legacy markdown markers — historical titles include things
  // like `\`#research\`` (literal backticks) that the body-text path
  // already cleans via PlainTextWithTickers but the title text was
  // rendering raw, so old entries showed as "`#research`" in the list.
  const rawTitle = entry.title_markdown?.trim() || ''
  const titleProse = stripLegacyMarkdown(rawTitle)
    .replace(/\$[A-Z][A-Z0-9.:]{0,9}/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const displayTitle = titleProse || (tickers.length > 0 ? '' : '(Untitled)')

  const content = (
    <Box
      sx={{
        px: { xs: 1.25, sm: 1.5 },
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Tickers — left side, fixed; badges inline so the category signal
          (buy/sell/other) sticks to the ticker it describes. */}
      {tickers.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {tickers.slice(0, 3).map((t) => (
            <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
              <Typography
                component="span"
                sx={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  color: 'primary.main',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  letterSpacing: '-0.01em',
                }}
              >
                {t}
              </Typography>
              <TickerActionBadge categories={tickerActionMap.get(t) ?? new Set()} />
            </Box>
          ))}
          {tickers.length > 3 && (
            <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.25 }}>
              +{tickers.length - 3}
            </Typography>
          )}
        </Box>
      )}

      {/* Title prose — flex, truncates with ellipsis when long. */}
      {displayTitle && (
        <Typography
          component="div"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.85rem',
            color: tickers.length > 0 ? 'text.secondary' : 'text.primary',
            fontWeight: tickers.length > 0 ? 400 : 500,
          }}
        >
          {displayTitle}
        </Typography>
      )}
      {/* Spacer when only tickers (no title prose) so the date hugs the right */}
      {!displayTitle && <Box sx={{ flex: 1 }} />}

      {/* Date — always visible, right-aligned, secondary colour. */}
      <Typography
        component="span"
        variant="caption"
        sx={{
          color: 'text.secondary',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <RelativeDate date={entry.date} variant="caption" sx={{ color: 'inherit' }} />
      </Typography>

      {/* Badges — compact, hidden on xs to keep the row breathable on phones. */}
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <ProcessOutcomeBadge {...entryProcessOutcome(entry)} />
        <InvestmentScoreBadge score={effectiveInvestmentScore(entry)} />
      </Box>
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
  const [investmentFilter, setInvestmentFilter] = useState<InvestmentFilter>('all')
  const [pageSize, setPageSize] = useState(INITIAL_PAGE_SIZE)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── react-query: shared cache, auto-refetches when entries change anywhere ──
  const entriesQ = useEntriesWithActions({ search: debouncedSearch || undefined, limit: pageSize })
  // Stable reference for downstream useMemos.
  const entries: EntryWithActions[] = useMemo(() => entriesQ.data ?? [], [entriesQ.data])
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

  const handlePullRefresh = async () => {
    await entriesQ.refetch()
  }

  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.tags))).sort(),
    [entries]
  )

  // Client filters: tag + investment bucket. The old "Hide automated"
  // toggle was retired alongside the broker-import surface.
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
        {/* Row 1: title + "new" CTA on the same line. Grid-vs-list toggle
            removed — the dense-row layout below is the only view now. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
          <Typography variant="h1" sx={{ flex: 1, mt: 0.5 }}>Journal</Typography>
          <Button
            component={RouterLink}
            to="/entries/new"
            variant="contained"
            size="small"
            sx={{ textTransform: 'none', height: 32, minHeight: 32, px: 1.5, fontSize: '0.8rem', fontWeight: 600 }}
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
          {/* Investment-bucket filter. The single-letter `S / M / I`
              labels were cryptic at rest (audit O-4); now showing full
              words `Spec / Mixed / Invest` at sm+ while keeping the
              compact form on xs so the filter row still fits. The
              colour tokens stay so the bucket is still scannable. */}
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
              <ToggleButton value="spec" sx={{ color: '#dc2626' }}>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>S&nbsp;</Box>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Spec&nbsp;</Box>
                {bucketCounts.spec}
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Mixed: some structure, some gaps">
              <ToggleButton value="mixed" sx={{ color: '#ca8a04' }}>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>M&nbsp;</Box>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Mixed&nbsp;</Box>
                {bucketCounts.mixed}
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Investment: detailed writeup + structure">
              <ToggleButton value="invest" sx={{ color: '#16a34a' }}>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>I&nbsp;</Box>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Invest&nbsp;</Box>
                {bucketCounts.invest}
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
          {/* "Hide automated / Show automated" toggle removed alongside
              the broker-import surface — every entry is shown the same
              way now since the user keeps decisions manually. */}
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
                  ? <Chip size="small" label={`${tagFilter.length} tag${tagFilter.length > 1 ? 's' : ''}`} sx={{ height: 20, fontSize: '0.65rem', ml: 0.25 }} />
                  : null
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={tagFilter.length === 0 ? 'Tags' : ''}
                />
              )}
              sx={{
                // L-2 fix: was `flex: 1` which made the Tags multiselect
                // grab all remaining horizontal room and dominate the
                // filter row. Pinning a tight max width keeps it
                // discoverable but unobtrusive; the input still expands
                // when the user actually types into it.
                minWidth: 90,
                maxWidth: 160,
                // Match the 26px height used by the investment-bucket toggle
                // group and the hide-automated chip to its right, and vertically
                // centre the placeholder/value. The previous overrides on
                // .MuiInputBase-input (`py: 2px !important`, `lineHeight: 1`)
                // were forcing the label off-centre; letting MUI pad naturally
                // and just pinning the outer height fixes it.
                '& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root': {
                  minHeight: 26,
                  height: 26,
                  py: 0,
                  px: 0.75,
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .MuiAutocomplete-input': {
                  py: 0,
                  fontSize: '0.7rem',
                },
                // Keep placeholder colour consistent with other filter controls.
                '& input::placeholder': {
                  color: 'text.secondary',
                  opacity: 0.85,
                },
              }}
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

      {/* ── Content — give a small gap below the sticky header. ── */}
      <Box sx={{ mt: 1.5 }} />
      {loading ? (
        <Stack spacing={0}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Box key={i} sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Skeleton variant="text" width={120} height={20} />
              <Skeleton variant="text" sx={{ flex: 1 }} height={18} />
              <Skeleton variant="text" width={60} height={18} />
            </Box>
          ))}
        </Stack>
      ) : filteredEntries.length === 0 ? (
        entries.length === 0 ? (
          <EmptyState
            icon={<ArticleOutlinedIcon />}
            title="No journal entries yet"
            action={
              <Button component={RouterLink} to="/entries/new" variant="contained" size="small" sx={{ textTransform: 'none' }}>
                New entry
              </Button>
            }
          />
        ) : (
          <EmptyState dense title="No entries match the current filters" />
        )
      ) : (
        <Stack spacing={0}>
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

      {/* The "Start writing" primary FAB used to live here too, but it
          duplicated the "+ New" button in the PageHeader actions slot.
          On every viewport that button stays visible from the top via
          PageHeader's sticky strip, so the FAB was just noise. The
          Scroll-to-top FAB stays — it has no equivalent affordance
          elsewhere. */}
      <Zoom in={showScrollTop}>
        <Fab
          color="default"
          size="small"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          sx={{
            position: 'fixed',
            bottom: { xs: 78, sm: 'max(16px, env(safe-area-inset-bottom))' },
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
