import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link as RouterLink, useLocation } from 'react-router-dom'
import { Box, Button, Chip, Typography, Alert, Stack, Skeleton, Link, useMediaQuery, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, InputAdornment } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import { useTheme } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { deleteEntry, updateEntry } from '../services/entriesService'
import { createReminder, deleteReminder } from '../services/remindersService'
import { fetchChartData } from '../services/chartApiService'
import { useAuth } from '../contexts/AuthContext'
import { deleteAction } from '../services/actionsService'
// Outcome create/update now happens inside the routed
// OutcomeFormPage — see DecisionCard's onAddOrEditOutcome below,
// which navigates rather than opening a modal here.
import { createOutcome } from '../services/outcomesService'
import { todayISO } from '../utils/dates'
import {
  createPrediction,
  updatePrediction,
  deletePrediction,
} from '../services/predictionsService'
import {
  useEntry,
  useActionsByEntry,
  useOutcomesByActionIds,
  usePredictions,
  useReminders,
  useInvalidate,
} from '../hooks/queries'
import { ListCard, ItemRow, EmptyState, AddPlusButton, PageHeader } from '../components/system'
import TickerDollarField from '../components/TickerDollarField'
import TimelineIcon from '@mui/icons-material/Timeline'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import PredictionInlineForm from '../components/PredictionInlineForm'
import ConfirmDialog from '../components/ConfirmDialog'
import DecisionCard from '../components/DecisionCard'
import ValuationWidget from '../components/ValuationWidget'
import PredictionCard from '../components/PredictionCard'
import PlainTextWithTickers from '../components/PlainTextWithTickers'
import ScrollProgress from '../components/ScrollProgress'
import ContinuedFooter from '../components/ContinuedFooter'
import EntryNeighborsFooter from '../components/EntryNeighborsFooter'
import AddReminderDialog from '../components/AddReminderDialog'
import { useSnackbar } from '../contexts/SnackbarContext'
import { getEntryDisplayTitle } from '../utils/entryTitle'
import type { Outcome } from '../types/database'
import type { EntryPrediction } from '../types/database'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // Detail page reads the navigation state set by EntryFormPage on
  // save (justCreated/justSaved were the fold-corner flourish
  // triggers — kept on the type for future use) and by
  // OutcomeFormPage (justClosedActionId drives the card flash).
  const locationState = location.state as { justCreated?: boolean; justSaved?: boolean; justClosedActionId?: string } | null
  // Phase-3 closure moment: when returning from OutcomeFormPage with
  // a just-closed action id, flash the matching DecisionCard for
  // ~1.2s and show an italic kicker below the actions tab. Cleared
  // by a timeout so subsequent navigations don't re-trigger.
  const [justClosedActionId, setJustClosedActionId] = useState<string | null>(
    locationState?.justClosedActionId ?? null
  )
  useEffect(() => {
    if (!justClosedActionId) return
    const t = setTimeout(() => setJustClosedActionId(null), 1400)
    return () => clearTimeout(t)
  }, [justClosedActionId])
  const { user } = useAuth()
  const { showSuccess, showError } = useSnackbar()
  const muiTheme = useTheme()
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'))

  // ─── Server data via react-query (auto-refreshes after mutations elsewhere) ───
  const entryQ = useEntry(id)
  const actionsQ = useActionsByEntry(id)
  // Stable reference for downstream useMemos.
  const actions = useMemo(() => actionsQ.data ?? [], [actionsQ.data])
  const outcomesQ = useOutcomesByActionIds(actions.map((a) => a.id))
  const outcomesByActionId = useMemo(() => {
    const map: Record<string, Outcome> = {}
    ;(outcomesQ.data ?? []).forEach((o) => { map[o.action_id] = o })
    return map
  }, [outcomesQ.data])
  const predictionsQ = usePredictions(id)
  const predictions = predictionsQ.data ?? []
  const remindersQ = useReminders(true)
  const entryReminders = useMemo(
    () => (remindersQ.data ?? []).filter((r) => r.entry_id === id),
    [remindersQ.data, id]
  )

  const entry = entryQ.data ?? null
  const loading = entryQ.isLoading
  const error = entryQ.error?.message ?? null
  const invalidate = useInvalidate()
  const [detailTab, setDetailTab] = useState(0)
  const [quickNote, setQuickNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'action'; id: string }
    | { type: 'entry' }
    | { type: 'prediction'; id: string }
    | null
  >(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [predictionDialogOpen, setPredictionDialogOpen] = useState(false)
  const [editingPrediction, setEditingPrediction] = useState<EntryPrediction | null>(null)
  const [currentPriceByTicker, setCurrentPriceByTicker] = useState<Record<string, number>>({})

  const openActionTickers = useMemo(() => {
    const withOutcome = new Set(Object.keys(outcomesByActionId))
    return Array.from(
      new Set(
        actions
          .filter((a) => !withOutcome.has(a.id) && (a.type === 'buy' || a.type === 'add_more') && a.ticker?.trim())
          .map((a) => (a.ticker || '').trim().toUpperCase())
      )
    ).filter(Boolean)
  }, [actions, outcomesByActionId])
  // Stable string key — primitive dep for the price-fetch useEffect below.
  const openActionTickersKey = openActionTickers.join(',')

  useEffect(() => {
    if (openActionTickers.length === 0) return
    let cancelled = false
    openActionTickers.forEach((ticker) => {
      fetchChartData(ticker, '3m')
        .then((data) => {
          if (cancelled || !data?.prices?.length) return
          const last = data.prices[data.prices.length - 1]
          if (last != null && Number.isFinite(last)) {
            setCurrentPriceByTicker((prev) => ({ ...prev, [ticker]: last }))
          }
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openActionTickersKey])

  const handleAddNote = async () => {
    if (!quickNote.trim() || !id || !entry) return
    setSavingNote(true)
    try {
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
      // Plain-text only — per docs/PRINCIPLES.md the body is the source
      // of truth as plain text, no markdown markers. Earlier this used
      // `> **Note Apr 20, 26:** …` which baked in a blockquote prefix
      // and bold markers that the render-time stripLegacyMarkdown then
      // had to scrub. Just write a plain prefix.
      const noteBlock = `\n\nNote ${date}: ${quickNote.trim()}`
      const updated = (entry.body_markdown || '') + noteBlock
      await updateEntry(id, { body_markdown: updated })
      invalidate.entries()
      setQuickNote('')
      showSuccess('Note added')
    } catch (err) {
      // Surface failures instead of swallowing them — same lesson as
      // the EntryFormPage silent-warn that hid the missing-column bug.
      const msg = err instanceof Error ? err.message : 'Failed to add note'
      showError(`Note failed to save: ${msg}`)
    } finally {
      setSavingNote(false)
    }
  }

  const handleDeleteReminder = async (reminderId: string) => {
    try {
      await deleteReminder(reminderId)
      invalidate.reminders()
    } catch (err) {
      // Surface the failure — earlier this was a console-only silent
      // drop, which meant a schema/RLS mismatch would leave the
      // reminder visibly stuck in the list with no hint why.
      console.error('delete reminder failed', err)
      const msg = err instanceof Error ? err.message : 'Failed to delete reminder'
      showError(msg)
    }
  }

  if (loading || !id) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rectangular" height={36} width="60%" />
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={80} />
      </Stack>
    )
  }
  if (error || !entry) {
    return (
      <Box>
        <Alert severity="error">{error ?? 'Entry not found'}</Alert>
        <Button component={RouterLink} to="/" sx={{ mt: 2 }}>
          Back to journal
        </Button>
      </Box>
    )
  }

  const hasOutcomes = actions.some((a) => outcomesByActionId[a.id])

  // Mobile collapses Edit / Remind / Delete into a MoreVert overflow so
  // the sticky title strip stays visually tight. Desktop still shows the
  // primary actions inline. Same actions, two presentations.
  const mobileActions = (
    <>
      <IconButton
        size="small"
        aria-label="Entry actions"
        onClick={(e) => setOverflowAnchor(e.currentTarget)}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={overflowAnchor}
        open={Boolean(overflowAnchor)}
        onClose={() => setOverflowAnchor(null)}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      >
        <MenuItem
          onClick={() => {
            setOverflowAnchor(null)
            setReminderDialogOpen(true)
          }}
        >
          <ListItemIcon>
            <NotificationsActiveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add reminder</ListItemText>
        </MenuItem>
        <MenuItem
          component={RouterLink}
          to={`/entries/${entry.id}/edit`}
          onClick={() => setOverflowAnchor(null)}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOverflowAnchor(null)
            setConfirmDelete({ type: 'entry' })
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete entry</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )

  return (
    <Box>
      <ScrollProgress />
      {/* Sticky PageHeader brings Entry detail in line with Timeline /
          Per-ticker: on mobile the title strip sticks under the AppBar
          so the user always knows which entry they're reading. The
          eyebrow carries the "Journal /" breadcrumb bit the ad-hoc
          Breadcrumbs block used to. */}
      <PageHeader
        eyebrow={
          <Link component={RouterLink} to="/" underline="hover" color="inherit">
            Journal
          </Link>
        }
        title={<PlainTextWithTickers source={getEntryDisplayTitle(entry, actions)} inline dense />}
        actions={
          isMobile ? (
            mobileActions
          ) : (
            <>
              <Button
                component={RouterLink}
                to={`/entries/${entry.id}/edit`}
                variant="contained"
                size="small"
                startIcon={<EditIcon />}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<NotificationsActiveIcon />}
                onClick={() => setReminderDialogOpen(true)}
              >
                Remind me
              </Button>
              <IconButton
                aria-label="Delete entry"
                onClick={() => setConfirmDelete({ type: 'entry' })}
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'rgba(185,28,28,0.06)' } }}
                size="small"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </>
          )
        }
        dense
      />
      {/* Dateline — italic serif "Sunday, April 21, 2026 · Your desk"
          slug right under the masthead title. Reinforces that this
          is an ARTICLE page, not a generic card. */}
      <Box aria-hidden sx={{ mb: 1, textAlign: { xs: 'center', sm: 'left' } }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
            fontStyle: 'italic',
            color: 'text.disabled',
            fontSize: '0.82rem',
            letterSpacing: '0.02em',
          }}
        >
          {(() => {
            try {
              const d = new Date(entry.date + 'T00:00:00')
              const dateStr = d.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
              // Reading-time estimate — ~200 wpm, minimum 1 min.
              // Only appended when the body is long enough that a
              // time estimate actually orients the reader (short
              // one-liners don't need "1 min read").
              const body = entry.body_markdown || ''
              const words = body.trim() ? body.trim().split(/\s+/).filter(Boolean).length : 0
              const minutes = words >= 120 ? Math.max(1, Math.round(words / 200)) : 0
              const byline = entry.author ? ` · ${entry.author}` : ' · Your desk'
              const read = minutes > 0 ? ` · ${minutes} min read` : ''
              return `${dateStr}${read}${byline}`
            } catch {
              return ''
            }
          })()}
        </Typography>
      </Box>
      {/* Tags as small-caps category line (newspaper section kicker)
          rather than a row of chips. Chips read as interactive app UI;
          small caps reads as print category. Click a tag to filter. */}
      {entry.tags.length > 0 && (
        <Box sx={{ mb: 2, textAlign: { xs: 'center', sm: 'left' } }}>
          {entry.tags.map((t, i) => (
            <Box
              component={RouterLink}
              to={`/?tag=${encodeURIComponent(t)}`}
              key={t}
              sx={{
                display: 'inline-block',
                color: 'text.disabled',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                '&:hover': { color: 'primary.main' },
                transition: 'color 140ms ease',
                mr: i === entry.tags.length - 1 ? 0 : 1.5,
              }}
            >
              {t}
            </Box>
          ))}
        </Box>
      )}
      {hasOutcomes && (
        <Box
          sx={{
            mb: 2,
            py: 0.75,
            borderTop: '1px dashed',
            borderBottom: '1px dashed',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              fontStyle: 'italic',
              color: 'text.secondary',
              fontSize: '0.8rem',
            }}
          >
            This entry has recorded outcomes — edits rewrite the historical record.
          </Typography>
        </Box>
      )}
      {entry.body_markdown.trim() && (
        <Box
          sx={{
            // Article body — no Paper wrapper, no bgcolor, no blue
            // accent bar. The page itself is the paper; the prose
            // stands on its own column with hairline rules above
            // and below, plus a vertical "column rule" on the left
            // that indents the body like an editorial blockquote
            // or newspaper gutter. Maxes out at a comfortable 68ch
            // reading column and centers on wider screens so it
            // doesn't stretch edge-to-edge like a form field.
            maxWidth: { xs: '100%', md: '68ch' },
            mx: { xs: 0, md: 'auto' },
            mb: 2,
            py: { xs: 2, sm: 3 },
            // Indent + left rule — treats the body as an extended
            // passage (the "what I was thinking" column) rather
            // than a generic card. The left rule is a touch
            // stronger than the top/bottom hairlines so the
            // indentation reads as deliberate, not accidental.
            pl: { xs: 2, sm: 3 },
            pr: { xs: 0.5, sm: 1 },
            borderLeft: '2px solid',
            borderLeftColor: 'rgba(15, 23, 42, 0.18)',
            borderTop: '1px solid',
            borderBottom: '1px solid',
            borderTopColor: 'divider',
            borderBottomColor: 'divider',
            position: 'relative',
            // ── Tier-1 micro-typography ──────────────────────────────
            // Hanging punctuation: opening quotes / brackets hang
            // slightly outside the column so the optical left edge
            // stays straight. Safari supports it today; other browsers
            // ignore the property — pure progressive enhancement.
            hangingPunctuation: 'first last allow-end',
            // Enable ligatures, kerning and old-style (text) figures
            // in prose. Old-style digits (with descenders) sit in a
            // sentence without shouting the way lining numerals do —
            // newspaper convention. Tabular/lining figures are still
            // used elsewhere (metrics, prices) via JetBrains Mono.
            fontFeatureSettings: '"liga" 1, "kern" 1, "onum" 1',
            // Prevent orphan lines at the end of paragraphs and
            // hyphenate long words so the column edge doesn't go
            // ragged. (`orphans` is historically a print-only
            // property but Chromium honors it in paginated / column
            // layouts; safe no-op elsewhere.)
            hyphens: 'auto',
            orphans: 3,
            widows: 3,
            '& p:first-of-type': { mt: 0 },
            '& p:last-of-type': { mb: 0 },
            // text-wrap: pretty evens out line breaks and avoids
            // single-word dangling lines at the end of paragraphs.
            // Browser-native, no JS, silent no-op on older browsers.
            '& p': { textWrap: 'pretty' },
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            // Editorial first-letter drop cap on the lead paragraph.
            // Picks the first paragraph's first span ("text") from the
            // PlainTextWithTickers render tree and promotes its initial
            // letter via ::first-letter. Uses the display (serif) font,
            // drops 2 lines, and is tinted with primary ink so it reads
            // as a deliberate editorial signature, not a CSS accident.
            // Only fires on the very first paragraph — subsequent ones
            // are plain. Skipped on xs-sm widths where the drop cap
            // would crowd the narrow column.
            '& p:first-of-type > span:first-of-type > span:first-of-type::first-letter': {
              display: { xs: 'inline', md: 'block' },
              float: { md: 'left' },
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              fontSize: { xs: 'inherit', md: '3.4rem' },
              lineHeight: { xs: 'inherit', md: 0.9 },
              fontWeight: 700,
              color: { xs: 'inherit', md: 'primary.dark' },
              marginRight: { md: 1 },
              marginTop: { md: '0.15em' },
            },
            // Scroll-triggered fade + rise on each paragraph as it
            // enters the viewport — NYT long-read feel. Uses native
            // CSS scroll-driven animations (Chrome 115+ / Firefox 140+),
            // so it's a progressive enhancement: browsers that don't
            // support it just render the paragraph fully visible, no
            // fallback JS needed. Honors prefers-reduced-motion.
            '@supports (animation-timeline: view())': {
              '& p': {
                animation: 'entry-body-rise linear both',
                animationTimeline: 'view()',
                animationRange: 'entry 0% cover 18%',
              },
              '@keyframes entry-body-rise': {
                from: { opacity: 0, transform: 'translateY(6px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                '& p': { animation: 'none' },
              },
            },
          }}
        >
          <PlainTextWithTickers source={entry.body_markdown} dense endMark />
          <ContinuedFooter source={entry.body_markdown} />
        </Box>
      )}

      {/* Page-turn footer — newer / older neighbor entries. Sits
          inside the same 68ch column as the body so it reads as
          part of the article tail, not app chrome. Closes the
          reading flow before the tabbed app sections begin. */}
      <EntryNeighborsFooter entry={{ id: entry.id, date: entry.date }} />

      {/* Quick note — append a timestamped note without editing the full entry.
          Multi-line auto-grow; Cmd/Ctrl+Enter or Enter (no shift) submits.
          Uses TickerDollarField so typing $ pops the same ticker autocomplete
          you get in the entry title and body. The dropdown's own Enter handler
          (when open) preventDefaults, so Enter-to-submit only fires when
          autocomplete is closed — no conflict. */}
      <TickerDollarField
        size="small"
        placeholder="Add a note… ($ for tickers)"
        value={quickNote}
        onChange={setQuickNote}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            // Don't fire if defaultPrevented — TickerDollarField may have
            // captured Enter to select an autocomplete result.
            if (e.defaultPrevented) return
            e.preventDefault()
            handleAddNote()
          }
        }}
        disabled={savingNote}
        fullWidth
        multiline
        minRows={1}
        maxRows={8}
        sx={{ mt: 1.5, '& .MuiInputBase-root': { fontSize: '0.85rem', alignItems: 'flex-end' } }}
        InputProps={{
          endAdornment: quickNote.trim() ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleAddNote} disabled={savingNote} edge="end">
                <SendIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {/* Decision Context — each field renders as its own ListCard so the
          detail view uses the same visual vocabulary as the edit form and
          the Reminders section. Only shows cards for fields that have a
          value; the whole block is skipped if every field is empty. */}
      {(() => {
        // Parse trading_plan once into entry/exit rule lists.
        const splitRules = (s: string) => s.split(/\s*\n\s*|\s*;\s*|\s*·\s*/).map((r) => r.trim()).filter(Boolean)
        const lines = (entry.trading_plan || '').split('\n')
        const entryRulesDisp = splitRules(lines.find((l) => l.startsWith('Entry:'))?.replace('Entry:', '').trim() ?? '')
        const exitRulesDisp = splitRules(lines.find((l) => l.startsWith('Exit:'))?.replace('Exit:', '').trim() ?? '')
        const hasAny = entry.market_feeling != null || entry.market_context || entry.decision_horizon || entryRulesDisp.length > 0 || exitRulesDisp.length > 0
        if (!hasAny) return null
        const sentimentLabel = (v: number) =>
          v <= -7 ? 'Extreme Fear' : v <= -3 ? 'Fear' : v <= -1 ? 'Mild Fear' : v === 0 ? 'Neutral' : v <= 2 ? 'Mild Optimism' : v <= 6 ? 'Optimistic' : 'Extreme Greed'
        const hasContext = entry.market_feeling != null || entry.market_context || entry.decision_horizon
        return (
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Context card — merged Market Sentiment + Market
                Conditions + Expected Resolution into one card with
                tight rows. The three used to be three separate
                ListCards each eating its own row of chrome for one
                tiny piece of data; one card with a hairline divider
                between rows fits all three in a third of the height. */}
            {hasContext && (
              <ListCard title="Context" hasValue>
                <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={0}>
                  {entry.market_feeling != null && (
                    <Box sx={{ py: 0.75, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary' }}>Sentiment</Typography>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: entry.market_feeling > 0 ? 'success.main' : entry.market_feeling < 0 ? 'error.main' : 'text.secondary' }}
                      >
                        {entry.market_feeling > 0 ? '+' : ''}{entry.market_feeling}
                        <Typography component="span" variant="body2" color="text.secondary" fontWeight={500} sx={{ ml: 0.75 }}>
                          · {sentimentLabel(entry.market_feeling)}
                        </Typography>
                      </Typography>
                    </Box>
                  )}
                  {entry.market_context && (
                    <Box sx={{ py: 0.75, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary' }}>Conditions</Typography>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {entry.market_context.split(',').map((cond) => {
                          const trimmed = cond.trim()
                          return trimmed ? <Chip key={trimmed} label={trimmed} size="small" variant="outlined" /> : null
                        })}
                      </Box>
                    </Box>
                  )}
                  {entry.decision_horizon && (
                    <Box sx={{ py: 0.75, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary' }}>Resolves by</Typography>
                      <Typography variant="body2">{entry.decision_horizon}</Typography>
                    </Box>
                  )}
                </Stack>
              </ListCard>
            )}
            {entryRulesDisp.length > 0 && (
              <ListCard title="Entry Rules" count={entryRulesDisp.length} hasValue>
                {entryRulesDisp.map((r, i) => (
                  <ItemRow key={`er-${i}`}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{r}</Typography>
                  </ItemRow>
                ))}
              </ListCard>
            )}
            {exitRulesDisp.length > 0 && (
              <ListCard title="Exit Rules" count={exitRulesDisp.length} hasValue>
                {exitRulesDisp.map((r, i) => (
                  <ItemRow key={`xr-${i}`}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{r}</Typography>
                  </ItemRow>
                ))}
              </ListCard>
            )}
          </Box>
        )
      })()}

      {/* Reminders on this entry — list of active ones with an "+ Add" in the header.
          Mirrors the entry form's ListCard pattern so the vocabulary stays consistent. */}
      <Box sx={{ mt: 2 }}>
        <ListCard
          title="Reminders"
          count={entryReminders.length}
          headerAction={<AddPlusButton label="Add reminder" onClick={() => setReminderDialogOpen(true)} />}
        >
          {entryReminders.map((r) => {
            const when = r.reminder_date
            // The 'decision_horizon' branch was dead code — that string
            // was never in the REMINDER_TYPES enum so the comparison
            // always returned false. Reduced to the two real types
            // ('idea_refresh' and 'prediction_ended', the latter
            // labelled simply as 'Review').
            const typeLabel = r.type === 'idea_refresh' ? 'Refresh idea' : 'Review'
            return (
              <ItemRow
                key={r.id}
                onDelete={() => handleDeleteReminder(r.id)}
                ariaLabel="Remove reminder"
              >
                <NotificationsActiveIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box display="flex" alignItems="baseline" gap={0.75} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>{when}</Typography>
                    <Typography variant="caption" color="text.secondary">· {typeLabel}</Typography>
                  </Box>
                  {r.note && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.note}
                    </Typography>
                  )}
                </Box>
              </ItemRow>
            )
          })}
        </ListCard>
      </Box>

      {/* Quick actions row — visible on mobile */}
      {isMobile && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<NotificationsActiveIcon sx={{ fontSize: 16 }} />}
            onClick={() => setReminderDialogOpen(true)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1 }}
          >
            Remind me
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
            component={RouterLink}
            to={`/entries/${entry.id}/edit`}
            sx={{ textTransform: 'none', fontSize: '0.75rem', flex: 1 }}
          >
            Edit
          </Button>
        </Box>
      )}

      {/* ── Tabbed sections: Actions / Predictions / Feelings ── */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={detailTab}
            onChange={(_, v) => setDetailTab(v)}
            variant="scrollable"
            scrollButtons={false}
            sx={{ flex: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.8rem', minWidth: 0, px: 1.5 } }}
          >
            <Tab label={`Actions (${actions.length})`} />
            <Tab label={`Predictions (${predictions.length})`} />
            <Tab label="Valuation" />
          </Tabs>
          {detailTab === 0 && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => navigate(`/decisions/new?entry_id=${id}`)} sx={{ flexShrink: 0, mr: 0.5, fontSize: '0.75rem' }}>
              Add
            </Button>
          )}
          {detailTab === 1 && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => { setEditingPrediction(null); setPredictionDialogOpen(true); }} sx={{ flexShrink: 0, mr: 0.5, fontSize: '0.75rem' }}>
              Add
            </Button>
          )}
        </Box>

        {/* Tab 0: Actions */}
        {detailTab === 0 && (
          <Box sx={{ pt: 1.5 }}>
            {actions.length === 0 ? (
              <EmptyState
                dense
                icon={<TimelineIcon />}
                title="No decisions on this entry yet"
                action={
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/decisions/new?entry_id=${id}`)} sx={{ textTransform: 'none' }}>
                    Add decision
                  </Button>
                }
              />
            ) : (
              <Stack spacing={1}>
                {actions.map((a) => (
                  <DecisionCard
                    key={a.id}
                    action={a}
                    outcome={outcomesByActionId[a.id]}
                    currentPrice={a.ticker ? currentPriceByTicker[(a.ticker || '').trim().toUpperCase()] : undefined}
                    justClosed={justClosedActionId === a.id}
                    onQuickVerdict={async (verdict) => {
                      // One-click close path: save minimal outcome
                      // (score derived from verdict, no notes, no
                      // follow-up). Writer can enrich later via
                      // Details → which opens the full page.
                      const score = verdict === 'right' ? 5 : verdict === 'wrong' ? 1 : 3
                      const quality = verdict === 'right' ? 'good' : verdict === 'wrong' ? 'bad' : null
                      try {
                        await createOutcome({
                          action_id: a.id,
                          realized_pnl: null,
                          outcome_date: todayISO(),
                          notes: '',
                          driver: null,
                          post_mortem_notes: null,
                          process_quality: null,
                          outcome_quality: quality,
                          process_score: null,
                          outcome_score: score,
                          closing_memo: null,
                          error_type: null,
                          what_i_remember_now: null,
                        })
                        invalidate.outcomes()
                        setJustClosedActionId(a.id)
                        showSuccess(`Closed as ${verdict === 'right' ? 'Right call' : verdict === 'wrong' ? 'Wrong call' : 'Inconclusive'}  ¶`)
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Could not save outcome'
                        showError(msg)
                      }
                    }}
                    onAddOrEditOutcome={() => {
                      // Navigate to the routed outcome form. If an
                      // outcome already exists, edit mode; otherwise
                      // create mode with the action pre-referenced.
                      if (outcomesByActionId[a.id]) {
                        navigate(`/outcomes/${a.id}/edit`)
                      } else {
                        navigate(`/outcomes/new?action_id=${a.id}`)
                      }
                    }}
                    onDelete={() => setConfirmDelete({ type: 'action', id: a.id })}
                    onEdit={() => navigate(`/decisions/${a.id}/edit`)}
                  />
                ))}
              </Stack>
            )}
            {/* Link to per-ticker aggregate view */}
            {actions[0]?.ticker && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  component={RouterLink}
                  to={`/tickers/${encodeURIComponent(actions[0].ticker.trim().toUpperCase())}`}
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: 'none' }}
                >
                  View all ${actions[0].ticker.trim().toUpperCase()} decisions
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Tab 1: Predictions */}
        {detailTab === 1 && (
          <Box sx={{ pt: 1.5 }}>
            {/* Inline add/edit form — appears in-page when the user
                clicks Add or Edit, no overlay. */}
            <PredictionInlineForm
              open={predictionDialogOpen}
              onClose={() => { setPredictionDialogOpen(false); setEditingPrediction(null); }}
              initial={editingPrediction}
              onSubmit={async (data) => {
                if (!id) return
                if (editingPrediction) {
                  await updatePrediction(editingPrediction.id, {
                    probability: data.probability,
                    end_date: data.end_date,
                    type: data.type,
                    label: data.label || null,
                    ticker: data.ticker || null,
                    sub_skill: data.sub_skill,
                  })
                } else {
                  await createPrediction({
                    entry_id: id,
                    probability: data.probability,
                    end_date: data.end_date,
                    type: data.type,
                    label: data.label || null,
                    ticker: data.ticker || null,
                    sub_skill: data.sub_skill,
                  })
                }
                invalidate.predictions(id)
                showSuccess(editingPrediction ? 'Prediction updated' : 'Prediction added')
                setPredictionDialogOpen(false)
                setEditingPrediction(null)
              }}
            />

            {predictions.length === 0 ? (
              !predictionDialogOpen ? (
                <EmptyState
                  dense
                  icon={<QueryStatsIcon />}
                  title="No predictions on this entry yet"
                  action={
                    <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingPrediction(null); setPredictionDialogOpen(true); }} sx={{ textTransform: 'none' }}>
                      Add prediction
                    </Button>
                  }
                />
              ) : null
            ) : (
              <Stack spacing={1}>
                {predictions.map((p) => (
                  <PredictionCard
                    key={p.id}
                    prediction={p}
                    onEdit={() => { setEditingPrediction(p); setPredictionDialogOpen(true); }}
                    onDelete={() => setConfirmDelete({ type: 'prediction', id: p.id })}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* Tab 2: Valuation (Huber 3 Engines) */}
        {detailTab === 2 && id && (
          <Box sx={{ pt: 1.5 }}>
            <ValuationWidget entryId={id} defaultExpanded />
          </Box>
        )}
      </Box>

      {/* The bottom-of-page ActionFormDialog mount that used to handle
          add+edit decision flows for this entry is gone. Both flows
          now navigate to /decisions/new?entry_id=… and
          /decisions/:id/edit?from=/entries/… — DecisionFormPage owns
          the createAction / updateAction calls + the navigation back. */}

      <ConfirmDialog
        open={!!confirmDelete}
        title={
          confirmDelete?.type === 'entry'
            ? 'Delete entry?'
            : confirmDelete?.type === 'action'
              ? 'Delete action?'
              : confirmDelete?.type === 'prediction'
                ? 'Delete prediction?'
                : 'Delete?'
        }
        message={
          confirmDelete?.type === 'entry'
            ? 'This will permanently delete this journal entry and all its actions and outcomes.'
            : confirmDelete?.type === 'action'
              ? 'This will permanently delete this action and its outcome.'
              : confirmDelete?.type === 'prediction'
                ? 'This prediction will be removed from this entry.'
                : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmColor="error"
        loading={confirmLoading}
        onConfirm={async () => {
          if (!confirmDelete) return
          setConfirmLoading(true)
          try {
            if (confirmDelete.type === 'entry' && id) {
              await deleteEntry(id)
              invalidate.entries()
              showSuccess('Entry deleted')
              navigate('/')
            } else if (confirmDelete.type === 'action') {
              await deleteAction(confirmDelete.id)
              invalidate.actions()
              invalidate.outcomes()
              showSuccess('Action deleted')
            } else if (confirmDelete.type === 'prediction') {
              await deletePrediction(confirmDelete.id)
              invalidate.predictions(id)
              showSuccess('Prediction deleted')
            }
            setConfirmDelete(null)
          } finally {
            setConfirmLoading(false)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <AddReminderDialog
        open={reminderDialogOpen}
        onClose={() => setReminderDialogOpen(false)}
        entryTitle={getEntryDisplayTitle(entry, actions)}
        onSubmit={async (reminderDate, note) => {
          if (!user?.id || !entry?.id) return
          await createReminder(user.id, {
            entry_id: entry.id,
            type: 'entry_review',
            reminder_date: reminderDate,
            note,
          })
          showSuccess('Reminder set')
        }}
      />
      {/* OutcomeFormDialog used to mount here as a global modal.
          Moved to a routed page at /outcomes/new + /outcomes/:id/edit
          (OutcomeFormPage) so the closing-memo field gets real page
          width. The DecisionCard's Add-outcome button now navigates
          instead of opening a dialog. */}
    </Box>
  )
}
