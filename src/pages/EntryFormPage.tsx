import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom'
import {
  Autocomplete,
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Collapse,
  IconButton,
  Slider,
  Chip,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../contexts/AuthContext'
import { createEntry, updateEntry } from '../services/entriesService'
import { createPrediction, deletePrediction } from '../services/predictionsService'
import { usePredictions } from '../hooks/queries'
import { createAction } from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import { buildDecisionBlockMarkdown, type DecisionBlockFields } from '../utils/decisionBlockMarkdown'
import { stripLegacyMarkdown } from '../utils/stripLegacyMarkdown'
import type { ActionInsert } from '../types/database'
import { PageHeader, ListCard, ItemRow, AddPlusButton } from '../components/system'
import { generateEntryId } from '../utils/id'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useEntry, useInvalidate } from '../hooks/queries'
import InsertDecisionBlockDialog from '../components/InsertDecisionBlockDialog'
import TickerDollarField from '../components/TickerDollarField'
import DecisionChip from '../components/DecisionChip'
import { getTagPresets } from '../utils/tagPresets'
import TagChip from '../components/TagChip'
import BodyWritingFooter from '../components/BodyWritingFooter'
import AutoSavedKicker from '../components/AutoSavedKicker'
import PendingDraftBanner from '../components/PendingDraftBanner'
import ScoreLadder from '../components/ScoreLadder'
import { computeInvestmentScore } from '../utils/investmentScore'
import { useActionsByEntry, useValuation } from '../hooks/queries'
import {
  saveDraft as saveEntryDraft,
  deleteDraft as deleteEntryDraft,
  getDraft as getEntryDraft,
  latestDraft as latestEntryDraft,
  newDraftId as newEntryDraftId,
} from '../utils/entryDrafts'
import ComparableEntries from '../components/ComparableEntries'
import SlashMenuDialog from '../components/SlashMenuDialog'
import { todayISO } from '../utils/dates'

const getToday = todayISO

const EMPTY = {
  get date() { return getToday() },
  author: '',
  tags: [] as string[],
  title_markdown: '',
  body_markdown: '',
  market_context: '',
}

/**
 * One-line row card with a `+` at the end — click to expand and reveal inputs.
 * When the section has a value, shows an `×` to clear and collapse.
 * Used in the new-entry form to keep optional fields out of the way until needed.
 */
function RowCard({
  title,
  description,
  hasValue,
  summary,
  onClear,
  count,
  forceOpenAt,
  children,
}: {
  title: string
  description?: string
  hasValue: boolean
  /** Optional one-line preview shown when collapsed AND a value is present (rare since hasValue=true keeps it open). */
  summary?: React.ReactNode
  /** When defined AND the card is open, the `×` toggle clears the
   *  underlying state in addition to collapsing (used by Sentiment /
   *  Conditions where the card IS the value). When undefined, the
   *  `×` toggle just collapses — used for list-style cards like
   *  Predictions / Entry Rules / Exit Rules where collapsing must
   *  not delete the user's list. */
  onClear?: () => void
  /** Optional count badge — shows in the header like "Predictions (2)"
   *  so the user knows there's content even while collapsed. */
  count?: number
  /** Timestamp signal — when it changes, force the card open. Used
   *  by the slash menu so clicking "Set entry rules" actually
   *  expands the card instead of just scrolling to a still-collapsed
   *  one. The writer's subsequent manual toggles override this. */
  forceOpenAt?: number
  children: React.ReactNode
}) {
  // Start expanded if there's already content (hasValue === true).
  // The user's previous state overrides this once they interact.
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null)
  const open = manuallyOpen ?? hasValue

  // Respond to external "open me" signals from the slash menu etc.
  // Each new `forceOpenAt` timestamp nudges the card open.
  useEffect(() => {
    if (forceOpenAt != null) {
      setManuallyOpen(true)
    }
  }, [forceOpenAt])
  const handleHeaderClick = () => {
    if (!open) setManuallyOpen(true)
  }
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      // With onClear: clear-then-collapse (Sentiment/Conditions).
      // Without: collapse only, preserve list.
      if (onClear) onClear()
      setManuallyOpen(false)
    } else {
      setManuallyOpen(true)
    }
  }
  const toggleLabel = open
    ? (onClear ? `Remove ${title}` : `Collapse ${title}`)
    : `Add ${title}`
  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        transition: 'background-color 120ms, border-color 120ms',
        // Closed cards sit on a tinted background so they're not white-on-white;
        // opening surfaces them as the active edit area (white + accent border).
        bgcolor: open ? 'background.paper' : 'grey.50',
        borderColor: open ? 'primary.light' : 'divider',
      }}
    >
      <Box
        onClick={handleHeaderClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.75,
          py: 1,
          cursor: open ? 'default' : 'pointer',
          '&:hover': open ? undefined : { bgcolor: 'grey.100' },
          transition: 'background-color 120ms',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="baseline" gap={0.75}>
            <Typography variant="body2" fontWeight={700} color="text.primary">{title}</Typography>
            {count != null && count > 0 && (
              <Typography variant="caption" color="text.secondary" fontWeight={600}>({count})</Typography>
            )}
          </Box>
          {!open && description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.72rem', mt: 0.25 }}>
              {description}
            </Typography>
          )}
          {!open && summary && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {summary}
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={handleToggle}
          aria-label={toggleLabel}
          sx={{
            color: open ? 'text.secondary' : 'primary.contrastText',
            bgcolor: open ? 'transparent' : 'primary.main',
            '&:hover': { bgcolor: open ? 'action.hover' : 'primary.dark' },
            width: 28,
            height: 28,
          }}
        >
          {open ? <CloseIcon fontSize="small" /> : <AddIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>{children}</Box>
      </Collapse>
    </Paper>
  )
}

const MARKET_CONDITIONS = [
  'Bull Market',
  'Bear Market',
  'High Volatility',
  'Low Volatility',
  'Earnings Season',
  'Economic Data',
  'Geopolitical Event',
  'Fed Meeting',
]

export default function EntryFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { showSuccess, showError } = useSnackbar()
  const invalidate = useInvalidate()
  const isNew = !id || id === 'new'

  const [date, setDate] = useState(EMPTY.date)
  const [author, setAuthor] = useState(EMPTY.author)
  const [tagsStr, setTagsStr] = useState('')
  const [title_markdown, setTitleMarkdown] = useState(EMPTY.title_markdown)
  const [body_markdown, setBodyMarkdown] = useState(EMPTY.body_markdown)
  const [market_context, setMarketContext] = useState(EMPTY.market_context)
  const [market_feeling, setMarketFeeling] = useState<number | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Rules are stored server-side as newline-joined text, but the UI treats
  // them as a list of discrete bullets (port of the Decisions row pattern).
  const [entryRulesList, setEntryRulesList] = useState<string[]>([])
  const [exitRulesList, setExitRulesList] = useState<string[]>([])
  const [newEntryRule, setNewEntryRule] = useState('')
  const [newExitRule, setNewExitRule] = useState('')

  // Predictions: the UI is a list of pending (unsaved) + existing (already in
  // DB) rows. Existing ones carry an `id` so Delete can remove them server-side.
  interface PendingPrediction {
    id?: string           // present if it's an existing row from the DB
    probability: number
    end_date: string
  }
  const [predictions, setPredictions] = useState<PendingPrediction[]>([])
  const [newPredPct, setNewPredPct] = useState('')
  const [newPredDate, setNewPredDate] = useState('')
  const [decision_horizon, setDecisionHorizon] = useState('')
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  // Force-open signals for the three list-style RowCards — bumped
  // by the slash menu when the writer picks "Set entry rules" etc.
  // A new timestamp tells the target RowCard to expand on next
  // render (see RowCard's useEffect on forceOpenAt).
  const [predictionsOpenAt, setPredictionsOpenAt] = useState<number | undefined>()
  const [entryRulesOpenAt, setEntryRulesOpenAt] = useState<number | undefined>()
  const [exitRulesOpenAt, setExitRulesOpenAt] = useState<number | undefined>()
  const [deletedPredictionIds, setDeletedPredictionIds] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)
  const initialValuesRef = useRef({ title_markdown: '', body_markdown: '', tagsStr: '' })

  // Tag presets for autocomplete
  const tagPresets = useMemo(() => getTagPresets().map((p) => p.label), [])

  // Parse comma-separated tags string into array for Autocomplete
  const tagValues = useMemo(() =>
    tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
    [tagsStr]
  )

  // Auto-save draft to localStorage every 30s (new entries only).
  // `lastSavedAt` is exposed to the UI so we can render an italic
  // "Saved · just now" indicator that gives the writer quiet
  // confidence the page is keeping their words safe.
  //
  // Multi-slot: `draftIdRef` tracks which slot in `sdh_entry_drafts`
  // this page's content writes to. It's established at mount from
  // (in priority order): the `?draft=<id>` URL param (explicit
  // resume from DraftsDrawer), the most-recent fresh draft (<24 h),
  // or a freshly-minted id on first autosave. The `?fresh=1` param
  // skips all auto-restore so the writer gets an empty page even
  // when drafts exist.
  const draftIdRef = useRef<string | null>(null)
  const lastSaveRef = useRef(0)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  /** Snapshot of the content at the last successful autosave.
   *  Compared against current content each tick so we don't rewrite
   *  localStorage (and reset the "just now" kicker) when the writer
   *  has paused. Without this, the indicator flips between "30s ago"
   *  and "just now" every 30s forever — misleading and annoying. */
  const lastSavedContentRef = useRef<string>('')
  /** Pick-up-where-you-left banner — when a draft > 24h old exists
   *  in localStorage, we don't silently merge it into the form.
   *  We hold it here and render a gentle prompt that lets the user
   *  choose to continue or discard. */
  const [pendingDraft, setPendingDraft] = useState<null | {
    id: string
    title_markdown?: string
    body_markdown?: string
    tagsStr?: string
    savedAt: number
  }>(null)
  /** Cumulative session-delta word count — words added since the
   *  page mounted. Silent badge ("You've written 420 words this
   *  session"). Doesn't decrement on deletes because what you
   *  wrote, you wrote. */
  const startWordCountRef = useRef<number | null>(null)
  const [sessionWordsWritten, setSessionWordsWritten] = useState(0)
  /** Ring-buffer of the last 12 auto-save timestamps, for the
   *  save-sparkline visualisation in the kicker. Ephemeral —
   *  doesn't persist, just shows "you've been at this today". */
  const [saveHistory, setSaveHistory] = useState<number[]>([])

  // Focus mode — hides every optional structured-card so the writer
  // sees nothing but headline + body + save bar. Default off; the
  // toggle (eye icon) lives next to the save bar.
  const [focusMode, setFocusMode] = useState(false)

  // Typewriter scroll — when focus mode is on, tag the <body> so
  // global CSS applies scroll-padding-bottom: 45vh. Native caret-
  // into-view scrolling then keeps the caret ~55vh from the top as
  // the user types, giving the composing line a stable vertical
  // anchor. Clears the attribute on unmount or toggle-off so other
  // pages don't inherit the padding.
  useEffect(() => {
    if (focusMode) {
      document.body.dataset.focusWriting = 'true'
    } else {
      delete document.body.dataset.focusWriting
    }
    return () => { delete document.body.dataset.focusWriting }
  }, [focusMode])

  useEffect(() => {
    if (!isNew) return
    // Restore draft on mount. Three paths, resolved in order:
    //   1. `?draft=<id>` — user clicked Resume in the DraftsDrawer;
    //      load THAT specific draft and adopt its id (no banner).
    //   2. `?fresh=1` — user explicitly wants an empty page even
    //      if drafts exist (also suppresses any banner).
    //   3. No param — fall back to "most recent draft" semantics:
    //      < 24h old → silent restore (the "closed the tab, came
    //      back" common case); > 24h old → banner so the writer
    //      sees "you were writing about $X on Sunday — continue
    //      or discard" and doesn't get surprised by stale text.
    try {
      const wantedId = searchParams.get('draft')
      const fresh = searchParams.get('fresh') === '1'

      if (wantedId) {
        const d = getEntryDraft(wantedId)
        if (d) {
          draftIdRef.current = d.id
          if (d.title_markdown) setTitleMarkdown(d.title_markdown)
          if (d.body_markdown) setBodyMarkdown(d.body_markdown)
          if (d.tagsStr) setTagsStr(d.tagsStr)
        }
        return
      }

      if (fresh) {
        // Leave draftIdRef null — a new id is minted on first autosave.
        return
      }

      const d = latestEntryDraft()
      if (!d) return
      const age = Date.now() - d.savedAt
      if (age > 24 * 60 * 60 * 1000) {
        setPendingDraft({
          id: d.id,
          title_markdown: d.title_markdown,
          body_markdown: d.body_markdown,
          tagsStr: d.tagsStr,
          savedAt: d.savedAt,
        })
      } else {
        draftIdRef.current = d.id
        if (d.title_markdown) setTitleMarkdown(d.title_markdown)
        if (d.body_markdown) setBodyMarkdown(d.body_markdown)
        if (d.tagsStr) setTagsStr(d.tagsStr)
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Share Target: pre-fill from shared link (Android Share API)
  useEffect(() => {
    if (!isNew || searchParams.get('shared') !== '1') return
    const sharedTitle = searchParams.get('title') || ''
    const sharedText = searchParams.get('text') || ''
    const sharedUrl = searchParams.get('url') || ''

    // Extract a usable URL: prefer explicit url param, else find URL in text
    const url = sharedUrl || sharedText.match(/https?:\/\/\S+/)?.[0] || ''
    // Title: prefer explicit, else use text (minus any URL), else domain name
    let title = sharedTitle
    if (!title && sharedText) {
      title = sharedText.replace(/https?:\/\/\S+/g, '').trim()
    }
    if (!title && url) {
      try { title = new URL(url).hostname.replace('www.', '') } catch { /* ignore */ }
    }

    if (title) setTitleMarkdown(title)
    // Plain text only — the body is the source of truth as plain text
    // per PRINCIPLES.md, so don't write `[title](url)` markdown link
    // syntax. The URL is still autolinked at render time by
    // `getRichSegments`; users see it as a clickable blue link either
    // way, but the DB keeps a clean plain-text body.
    if (url) setBodyMarkdown(title ? `${title}\n${url}` : url)

    // Auto-tag based on source domain
    if (url) {
      try {
        const domain = new URL(url).hostname.replace('www.', '')
        const tag = domain.split('.')[0] // e.g. "substack" from "example.substack.com"
        setTagsStr(tag)
      } catch { /* ignore */ }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isNew) return
    const timer = setInterval(() => {
      const now = Date.now()
      if (now - lastSaveRef.current < 25000) return
      if (!title_markdown && !body_markdown) return
      // Skip when content hasn't changed since the last save. The
      // earlier code wrote localStorage every 30s even on idle
      // content, which kept `lastSavedAt = now` and made the kicker
      // read "just now" forever — the writer sees no time passing.
      const contentKey = `${title_markdown}\u0000${body_markdown}\u0000${tagsStr}`
      if (contentKey === lastSavedContentRef.current) return
      lastSaveRef.current = now
      lastSavedContentRef.current = contentKey
      // Lazily allocate a draft id on first save so we don't write
      // an empty slot for a writer who never actually typed. Once
      // set, subsequent autosaves target the same slot — the writer
      // can only edit one draft at a time on this page, and
      // Resume-from-drawer flips draftIdRef to the resumed id.
      if (!draftIdRef.current) draftIdRef.current = newEntryDraftId()
      saveEntryDraft(draftIdRef.current, {
        title_markdown, body_markdown, tagsStr, savedAt: now,
      })
      setLastSavedAt(now)
      // Record the save in the ring buffer for the sparkline. Keep
      // only the last 12 entries so the SVG stays cheap to render.
      setSaveHistory((prev) => [...prev.slice(-11), now])
    }, 30000)
    return () => clearInterval(timer)
  }, [isNew, title_markdown, body_markdown, tagsStr])

  // Session-delta word count — establish a baseline on first
  // meaningful render (so an edit flow starts at 0 added words,
  // and a restored fresh draft starts at its current count).
  useEffect(() => {
    if (startWordCountRef.current != null) return
    const baseline = (body_markdown.match(/\S+/g) || []).length
    startWordCountRef.current = baseline
  }, [body_markdown])

  // Recompute session words-added whenever body changes.
  useEffect(() => {
    if (startWordCountRef.current == null) return
    const now = (body_markdown.match(/\S+/g) || []).length
    const added = Math.max(0, now - startWordCountRef.current)
    setSessionWordsWritten(added)
  }, [body_markdown])

  // Clear draft on successful save — deletes only the slot this
  // page wrote to. Other drafts in `sdh_entry_drafts` are untouched.
  const clearDraft = useCallback(() => {
    const id = draftIdRef.current
    if (id) deleteEntryDraft(id)
    draftIdRef.current = null
  }, [])

  // Load existing entry via react-query so the form auto-refreshes if the
  // underlying entry is edited elsewhere (e.g. quick-note appended on detail page).
  const editEntryQ = useEntry(isNew ? undefined : id)
  useEffect(() => {
    if (isNew) {
      setLoading(false)
      return
    }
    if (editEntryQ.isLoading) {
      setLoading(true)
      return
    }
    setLoading(false)
    if (editEntryQ.error) {
      setError((editEntryQ.error as Error).message ?? 'Failed to load entry')
      return
    }
    const entry = editEntryQ.data
    if (!entry) return
    setDate(entry.date)
    setAuthor(entry.author)
    setTagsStr(entry.tags.join(', '))
    setTitleMarkdown(entry.title_markdown)
    setBodyMarkdown(entry.body_markdown)
    setMarketContext(entry.market_context || '')
    setMarketFeeling(entry.market_feeling || null)
    setDecisionHorizon(entry.decision_horizon || '')
    initialValuesRef.current = { title_markdown: entry.title_markdown, body_markdown: entry.body_markdown, tagsStr: entry.tags.join(', ') }
    if (entry.trading_plan) {
      const lines = entry.trading_plan.split('\n')
      const entryIdx = lines.findIndex((l) => l.startsWith('Entry:'))
      const exitIdx = lines.findIndex((l) => l.startsWith('Exit:'))
      if (entryIdx >= 0) {
        const raw = lines[entryIdx].replace('Entry:', '').trim()
        setEntryRulesList(raw ? raw.split(/\s*\n\s*|\s*;\s*|\s*·\s*/).filter(Boolean) : [])
      }
      if (exitIdx >= 0) {
        const raw = lines[exitIdx].replace('Exit:', '').trim()
        setExitRulesList(raw ? raw.split(/\s*\n\s*|\s*;\s*|\s*·\s*/).filter(Boolean) : [])
      }
    }
  }, [isNew, editEntryQ.data, editEntryQ.isLoading, editEntryQ.error])

  // Load existing actions + valuation for the entry being edited.
  // Powers the live ScoreLadder so the score reflects DB-side
  // signals (kill criteria, valuation set elsewhere) the form
  // doesn't directly track.
  const existingActionsQ = useActionsByEntry(isNew ? undefined : id)
  const existingValuationQ = useValuation(isNew ? undefined : id)

  // Load existing predictions for the entry being edited (only once per entry load).
  const existingPredictionsQ = usePredictions(isNew ? undefined : id)
  const loadedPredictionsIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (isNew || !id) return
    if (loadedPredictionsIdRef.current === id) return
    if (!existingPredictionsQ.data) return
    setPredictions(
      existingPredictionsQ.data.map((p) => ({
        id: p.id,
        probability: p.probability,
        end_date: p.end_date,
      }))
    )
    loadedPredictionsIdRef.current = id
  }, [isNew, id, existingPredictionsQ.data])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd+S: Save
      if (modifier && e.key === 's') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }

      // Ctrl/Cmd+Enter: Submit form
      if (modifier && e.key === 'Enter') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }

      // Ctrl/Cmd+B: open the "Add decision" dialog. Used to set a
      // body-tab state to 'decision' but that tab UI got refactored
      // out long ago; the decision picker is now its own dialog.
      if (modifier && e.key === 'b') {
        e.preventDefault()
        setDecisionDialogOpen(true)
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isNew])

  const tags = tagsStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  // First $TICKER mentioned in the title — used to pre-fill the decision form
  // so users don't have to retype the ticker they already named the entry after.
  const titleTickerHint = useMemo(() => {
    const m = title_markdown.match(/\$([A-Z0-9.:]+)/i)
    return m ? m[1].toUpperCase() : ''
  }, [title_markdown])

  const [pendingDecisions, setPendingDecisions] = useState<DecisionBlockFields[]>([])

  // ── Live investment score (drives ScoreLadder) ────────────────────
  // Combines local form state with any DB-side actions / valuation
  // / predictions so the ladder reflects "what would this entry
  // score if I saved right now?".
  //
  // Note: `pendingDecisions` (the inline decision-block dialog) does
  // not capture kill_criteria / pre_mortem_text — those structured
  // fields only live on the full DecisionFormPage. So the score uses
  // EXISTING actions (from the DB, edit-mode only) as the source of
  // truth for those signals. New entries with no actions yet will
  // see those signals listed as unfired, which is correct: the
  // writer needs to follow up by opening DecisionFormPage to add
  // kill / pre-mortem details.
  const liveScoreResult = useMemo(() => {
    const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
    const firstExisting = (existingActionsQ.data ?? [])[0]
    const firstAction = firstExisting
      ? {
          type: firstExisting.type,
          action_date: firstExisting.action_date,
          kill_criteria: firstExisting.kill_criteria,
          pre_mortem_text: firstExisting.pre_mortem_text,
          notes: firstExisting.notes,
        }
      : null
    return computeInvestmentScore({
      entry: { body_markdown, tags },
      actions: firstAction ? [firstAction] : [],
      predictions: existingPredictionsQ.data ?? [],
      hasValuation: !!existingValuationQ.data,
    })
  }, [
    body_markdown,
    tagsStr,
    existingActionsQ.data,
    existingPredictionsQ.data,
    existingValuationQ.data,
  ])

  // Decisions are NOT spliced into the body anymore — they stay structured.
  // We collect them in `pendingDecisions` and persist as `actions` rows on save.
  // The unused `markdown` arg keeps the dialog's onInsert signature stable.
  const handleInsertDecisionBlock = (_markdown: string, block: DecisionBlockFields) => {
    setPendingDecisions((prev) => [...prev, block])
    setDecisionDialogOpen(false)
  }

  /** Convert a decision block from the inline form into a structured `actions` row. */
  function blockToActionInsert(userId: string, entryId: string | null, block: DecisionBlockFields): ActionInsert {
    return {
      user_id: userId,
      entry_id: entryId,
      type: block.type,
      ticker: block.ticker.trim().toUpperCase(),
      company_name: block.company_name.trim() || null,
      action_date: block.action_date,
      price: block.price.trim(),
      currency: block.currency.trim() || null,
      shares: block.shares,
      reason: block.reason.trim(),
      notes: block.notes.trim(),
      size: block.size ?? null,
      // The InsertDecisionBlockDialog flow doesn't yet collect
      // instrument_type / option fields / market_value — defaults
      // for now so the schema constraint passes. Decisions that
      // need those fields use the full DecisionFormPage instead.
      instrument_type: 'stock',
      option_expiry: null,
      option_strike: null,
      option_right: null,
      market_value: null,
      raw_snippet: buildDecisionBlockMarkdown(block),
    }
  }

  /** Scroll a RowCard into view by matching its title. Waits ~160ms
   *  so the MuiCollapse animation on forceOpen can start and the
   *  target height is stable when the scroll fires. */
  const scrollCardIntoView = (titleMatch: string) => {
    setTimeout(() => {
      // RowCard's title is a `body2` Typography inside a Paper.
      const papers = Array.from(document.querySelectorAll('.MuiPaper-outlined'))
      const target = papers.find((p) => {
        const title = p.querySelector('.MuiTypography-body2')
        return title?.textContent?.trim() === titleMatch
      }) as HTMLElement | undefined
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 160)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      setError('You must be logged in to save an entry.')
      return
    }
    if (!title_markdown.trim() && !body_markdown.trim()) {
      setError('Entry must have a title or body.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Rules are stored as single joined lines per side; the UI treats them
      // as a list of bullets (split on newlines when loaded).
      const entryRulesStr = entryRulesList.map((r) => r.trim()).filter(Boolean).join('\n')
      const exitRulesStr = exitRulesList.map((r) => r.trim()).filter(Boolean).join('\n')
      const tradingPlan = entryRulesStr || exitRulesStr
        ? [
            entryRulesStr && `Entry: ${entryRulesStr}`,
            exitRulesStr && `Exit: ${exitRulesStr}`,
          ]
            .filter(Boolean)
            .join('\n')
        : null

      const entryData = {
        date,
        author: author || (user.email ?? ''),
        tags,
        // Strip residual markdown markers from any legacy content the user
        // pasted or didn't bother editing — the source of truth on disk should
        // be plain text now (per docs/PRINCIPLES.md).
        title_markdown: stripLegacyMarkdown(title_markdown),
        body_markdown: stripLegacyMarkdown(body_markdown),
        market_context: market_context || null,
        market_feeling: market_feeling ?? null,
        trading_plan: tradingPlan,
        decision_horizon: decision_horizon || null,
      }

      let entryId = id
      if (isNew) {
        const entry = await createEntry(user.id, {
          entry_id: generateEntryId(),
          ...entryData,
        })
        entryId = entry.id
        clearDraft()
      } else if (id) {
        await updateEntry(id, entryData)
      }

      // Auto-promote any decision blocks inserted via the "Decision" tab into
      // structured `actions` rows so they show up in the Ticker page, Timeline,
      // and analytics — not just as markdown in the body.
      //
      // Important: if a decision fails to insert (e.g. a missing-column 400
      // from PostgREST), keep the failed blocks in `pendingDecisions` so the
      // user can retry without re-typing, surface a real error message, and
      // SKIP the navigate() below — silently dropping decisions led to the
      // "I added it and it evaporated" bug we hit on 2026-04-19.
      const failedDecisions: Array<{ block: DecisionBlockFields; err: unknown }> = []
      if (entryId && pendingDecisions.length > 0) {
        const succeeded: DecisionBlockFields[] = []
        for (const block of pendingDecisions) {
          if (!block.ticker.trim()) continue
          try {
            await createAction(blockToActionInsert(user.id, entryId, block))
            if (block.type === 'pass') {
              await ensurePassedForUser(user.id, block.ticker.trim(), {
                passed_date: block.action_date,
                reason: block.reason,
                notes: block.notes,
              })
            }
            succeeded.push(block)
          } catch (actionErr) {
            console.warn('Failed to auto-promote decision block:', actionErr)
            failedDecisions.push({ block, err: actionErr })
          }
        }
        invalidate.actions()
        invalidate.passed()
        // Only drop the rows that actually saved — keep failures so the user
        // can fix and retry without re-entering ticker/reason/notes.
        if (failedDecisions.length > 0) {
          const stillPending = pendingDecisions.filter((p) => !succeeded.includes(p))
          setPendingDecisions(stillPending)
        } else {
          setPendingDecisions([])
        }
      }

      invalidate.entries()
      if (failedDecisions.length > 0) {
        const detail = failedDecisions[0].err instanceof Error ? failedDecisions[0].err.message : 'Unknown error'
        const noun = failedDecisions.length === 1 ? 'decision' : 'decisions'
        const msg = `Entry saved, but ${failedDecisions.length} ${noun} failed to attach: ${detail}`
        setError(msg)
        showError(msg)
        // Stay on the form — the user can fix the problem (or screenshot the
        // error) and retry. Navigating away would silently lose the work.
      } else {
        // Editorial signature on the success toast — ¶ (pilcrow) is
        // the classic copy-editor's "end of thought" mark. Quiet
        // editorial approval that pairs with the ¶-style aesthetic
        // everywhere else in the app.
        showSuccess(isNew ? 'Entry created  ¶' : 'Entry saved  ¶')
        // Pass a `justCreated` flag via navigation state so the
        // detail page can animate the fold-corner dog-ear in as a
        // visual "saved a page" moment.
        if (entryId) navigate(`/entries/${entryId}`, { state: { justCreated: isNew, justSaved: !isNew } })
      }

      // Save predictions — delete any the user removed, create any new ones.
      if (entryId) {
        try {
          for (const delId of deletedPredictionIds) {
            await deletePrediction(delId)
          }
          const toCreate = predictions.filter((p) => !p.id)
          for (const p of toCreate) {
            if (!p.end_date) continue
            const probability = Math.min(100, Math.max(0, p.probability || 0))
            await createPrediction({
              entry_id: entryId,
              probability,
              end_date: p.end_date,
              type: 'idea',
              label: `${probability}% by ${p.end_date}`,
              ticker: null,
            })
          }
          if (deletedPredictionIds.length || toCreate.length) {
            invalidate.predictions(entryId)
            setDeletedPredictionIds([])
          }
        } catch (predErr) {
          // Surface the failure (not silent) so a schema or validation issue
          // doesn't drop predictions invisibly. Same lesson as the decision-
          // block silent-warn that hid the missing `actions.size` column.
          console.warn('Failed to save predictions:', predErr)
          const msg = predErr instanceof Error ? predErr.message : 'Unknown error'
          showError(`Predictions failed to save: ${msg}`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setError(msg)
      showError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box component="form" ref={formRef} onSubmit={handleSubmit}>
      <PageHeader
        title={isNew ? 'New journal entry' : 'Edit journal entry'}
        dense
      />
      {pendingDraft && (
        <PendingDraftBanner
          draft={pendingDraft}
          onContinue={() => {
            // Adopt the banner draft's id so further autosaves
            // continue writing into the SAME slot (don't fork a
            // second slot with the same content).
            draftIdRef.current = pendingDraft.id
            if (pendingDraft.title_markdown) setTitleMarkdown(pendingDraft.title_markdown)
            if (pendingDraft.body_markdown) setBodyMarkdown(pendingDraft.body_markdown)
            if (pendingDraft.tagsStr) setTagsStr(pendingDraft.tagsStr)
            setPendingDraft(null)
          }}
          onDiscard={() => {
            deleteEntryDraft(pendingDraft.id)
            setPendingDraft(null)
          }}
        />
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Title + Date on one row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
        {/* Editorial headline treatment — serif display font, bigger
            size, tighter letter-spacing, no border chrome so it reads
            like a newspaper headline rather than a form field. A
            hairline underline fills in on focus (pen-stroke). */}
        <TickerDollarField
          fullWidth
          size="small"
          value={title_markdown}
          onChange={setTitleMarkdown}
          placeholder="Headline…"
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              bgcolor: 'transparent',
              '& fieldset': { border: 'none' },
            },
            '& .MuiOutlinedInput-input': {
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              fontSize: { xs: '1.35rem', sm: '1.6rem' },
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              padding: { xs: '8px 6px', sm: '8px 8px' },
              color: 'text.primary',
              // Dashed hairline under the title — gives the field
              // something to anchor to visually without a box.
              borderBottom: '1px dashed',
              borderColor: 'divider',
              transition: 'border-color 160ms ease',
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
              borderBottom: '1px solid',
              borderColor: 'primary.main',
            },
          }}
        />
        <TextField
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 140, flexShrink: 0, mt: { xs: 0.5, sm: 1 } }}
        />
      </Box>

      {/* Masthead date-line — italic serif kicker between headline
          and body, like a newspaper's "Sunday, April 20, 2026 · Your
          desk" slug. Quietly grounds the entry in time. Fades in
          50ms after the body so the rhythm reads: title → dateline
          → page arrives. */}
      <Box
        aria-hidden
        sx={{
          mb: 1,
          opacity: 0,
          animation: 'masthead-fade 260ms ease-out 120ms forwards',
          '@keyframes masthead-fade': {
            from: { opacity: 0, transform: 'translateY(2px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            opacity: 1,
            animation: 'none',
          },
        }}
      >
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
            // Format the (possibly user-edited) date field as a
            // newspaper-style slug. Uses user-locale weekday + long
            // month for readability.
            try {
              const d = new Date(date + 'T00:00:00')
              return d.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }) + ' · Your desk'
            } catch {
              return ''
            }
          })()}
        </Typography>
      </Box>

      {/* Tags row — entry-level metadata, lives above the body editor not inside it. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.06em', minWidth: 44 }}>
            Tags
          </Typography>
          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={tagPresets}
            value={tagValues}
            onChange={(_, newVal) => setTagsStr(newVal.join(', '))}
            renderTags={(value, getTagProps) =>
              value.map((opt, idx) => {
                const { key, ...rest } = getTagProps({ index: idx })
                return <TagChip key={key} tag={opt} size="small" {...rest} />
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={tagValues.length === 0 ? 'add a tag…' : ''}
                variant="standard"
                sx={{
                  '& .MuiInput-underline:before': { borderBottom: '1px dashed', borderColor: 'divider' },
                  '& .MuiInput-underline:after': { borderBottom: '1px solid', borderColor: 'primary.main' },
                  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: '1px solid', borderColor: 'text.secondary' },
                }}
              />
            )}
            sx={{ flex: 1, minWidth: 200 }}
          />
      </Box>

      {/* Body editor — "compose in a newspaper column" feel.
          Serif display font, generous line-height, centered max-width
          so long theses don't run edge-to-edge and become unreadable.
          Focus state warms the paper (white → faint cream) and blooms
          a soft primary glow so the writer feels like the page is
          "turning on" under them. The subtle left rule evokes a
          print column's margin. */}
      <Paper
        variant="outlined"
        sx={{
          mb: 1.5,
          bgcolor: 'background.paper',
          position: 'relative',
          overflow: 'hidden',
          // Rhythm reveal — the body arrives ~180ms after the title
          // + dateline. Small slide-in from 4px. Skipped on
          // reduced-motion.
          opacity: 0,
          animation: 'body-paper-arrive 320ms cubic-bezier(0.22, 1, 0.36, 1) 180ms forwards',
          '@keyframes body-paper-arrive': {
            from: { opacity: 0, transform: 'translateY(4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            opacity: 1,
            animation: 'none',
          },
          transition: 'box-shadow 260ms ease, border-color 260ms ease, background-color 260ms ease',
          // Focus-within lifts the editor subtly, warms the paper
          // and pulls a primary hairline along the left margin.
          '&:focus-within': {
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03), 0 8px 28px rgba(30, 64, 175, 0.08)',
            borderColor: 'primary.light',
          },
          // Newspaper-column left rule — a 2px primary tint appears
          // when the editor has focus. Invisible otherwise.
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            bgcolor: 'primary.main',
            opacity: 0,
            transition: 'opacity 260ms ease',
          },
          '&:focus-within::before': { opacity: 0.5 },
        }}
      >
        <TickerDollarField
          fullWidth
          multiline
          minRows={8}
          value={body_markdown}
          // @-mention shortcut — typing `@` anywhere in the body
          // strips the character back out and opens the decision
          // dialog. Keeps the body plain text (no inline tokens to
          // parse later) while giving the writer a one-keystroke way
          // to attach a structured decision without leaving the flow.
          // Smart-typography shortcuts also live here:
          //   --   → —   (em-dash)
          //   ...  → …   (ellipsis)
          //   "x"  → "x" (curly quotes, after-space-or-start)
          //   'x'  → 'x' (curly single, contraction-friendly)
          onChange={(next) => {
            // @-mention: only fire on a freshly-typed @ (string grew by
            // one char and the new char is @). Avoids re-firing on
            // every keystroke when the user pastes content with @ in it.
            const grew = next.length === body_markdown.length + 1
            const lastChar = grew ? next[next.length - 1] : null
            // Find @ that isn't already part of an email — require a
            // space or start-of-string before it.
            if (grew && lastChar === '@') {
              const before = next[next.length - 2] ?? ''
              const looksLikeEmail = /\w/.test(before)
              if (!looksLikeEmail) {
                setBodyMarkdown(next.slice(0, -1))
                setDecisionDialogOpen(true)
                return
              }
            }
            // /-slash menu: same gating as @. Strips the slash and
            // opens the insert-anything menu.
            if (grew && lastChar === '/') {
              const before = next[next.length - 2] ?? ''
              const inWord = /\w/.test(before)
              if (!inWord) {
                setBodyMarkdown(next.slice(0, -1))
                setSlashMenuOpen(true)
                return
              }
            }
            // Smart typography: only run on growth so paste / delete
            // doesn't get reformatted.
            let polished = next
            if (grew) {
              polished = polished
                .replace(/--$/, '—')
                .replace(/\.\.\.$/, '…')
            }
            setBodyMarkdown(polished)
          }}
          placeholder="Start writing your thesis… (type @ to attach a decision)"
          sx={{
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiInputBase-root': { borderRadius: 0, px: { xs: 2, sm: 4 }, py: 2.5 },
            '& .MuiInputBase-input': {
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              fontSize: { xs: '1rem', sm: '1.0625rem' },
              lineHeight: 1.7,
              letterSpacing: '0.005em',
              color: 'text.primary',
              maxWidth: '68ch',
              marginLeft: 'auto',
              marginRight: 'auto',
              // Italic placeholder feels editorial; 0.6 opacity keeps
              // it quiet enough to disappear the moment the user types.
              '&::placeholder': {
                fontStyle: 'italic',
                opacity: 0.58,
                color: 'text.disabled',
              },
            },
            // Caret color — warm primary so it reads as a pen nib
            // rather than a generic blinking cursor.
            '& textarea': {
              caretColor: 'var(--mui-palette-primary-dark, #1e3a8a)',
            },
          }}
        />
        {/* Live word + reading-time footer — shows only while writing
            is actively happening so it doesn't clutter the empty
            state. Matches the newspaper masthead rule style. */}
        <BodyWritingFooter text={body_markdown} />
      </Paper>

      {/* Writing toolbar strip — autosave indicator on the left, focus
          toggle on the right. Sits between the body and the optional
          cards as a one-line "you're writing" header for the structural
          fields below. */}
      {/* Investment-score ladder — visible while writing so the
          score climbs as you type and the unfired-signal chips
          show exactly what to add next for the biggest gains. */}
      <Box sx={{ mb: 1 }}>
        <ScoreLadder result={liveScoreResult} dense variant="paper" />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
          color: 'text.secondary',
        }}
      >
        <AutoSavedKicker
          isNew={isNew}
          lastSavedAt={lastSavedAt}
          hasContent={Boolean(title_markdown.trim() || body_markdown.trim())}
          saveHistory={saveHistory}
          sessionWordsWritten={sessionWordsWritten}
        />
        <Tooltip title={focusMode ? 'Show structured fields' : 'Focus on writing — hide structured fields'}>
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => setFocusMode((v) => !v)}
            startIcon={focusMode ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              fontStyle: 'italic',
              fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
              minHeight: 0,
              py: 0.25,
            }}
          >
            {focusMode ? 'Show fields' : 'Focus mode'}
          </Button>
        </Tooltip>
      </Box>

      <ComparableEntries
        draftText={`${title_markdown} ${body_markdown}`}
        draftTags={tagValues}
        hidden={focusMode}
        excludeEntryId={id}
      />

      {/* Optional context — each row is a mini card that expands on + click.
          Hidden in focus mode so the writer sees only the headline + body
          + save bar. The state is reversible via the eye-toggle in the
          header strip below the body. */}
      <Box sx={{ mb: 2, display: focusMode ? 'none' : 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Decisions — first-class card. Same pattern as all the ListCards below;
            the + button on the header opens the InsertDecisionBlockDialog modal. */}
        <ListCard
          title="Decisions"
          count={pendingDecisions.length}
          headerAction={<AddPlusButton label="Add decision" onClick={() => setDecisionDialogOpen(true)} />}
        >
          <AnimatePresence initial={false}>
            {pendingDecisions.map((d, i) => (
              <motion.div
                key={`${d.ticker}-${d.type}-${d.action_date}-${i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <ItemRow
                  onDelete={() => setPendingDecisions((prev) => prev.filter((_, idx) => idx !== i))}
                  ariaLabel="Remove decision"
                >
                  <DecisionChip type={d.type} size="small" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box display="flex" alignItems="baseline" gap={0.75} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={700} color="primary.main">
                        ${d.ticker}
                      </Typography>
                      {d.price && (
                        <Typography variant="caption" color="text.secondary">
                          {d.price}{d.currency ? ` ${d.currency}` : ''}
                        </Typography>
                      )}
                      {d.action_date && (
                        <Typography variant="caption" color="text.secondary">
                          · {d.action_date}
                        </Typography>
                      )}
                      {d.size && d.size !== 'medium' && (
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          · {d.size === 'xl' ? 'Very big' : d.size} size
                        </Typography>
                      )}
                    </Box>
                    {d.reason && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {d.reason}
                      </Typography>
                    )}
                  </Box>
                </ItemRow>
              </motion.div>
            ))}
          </AnimatePresence>
          {pendingDecisions.length > 0 && (
            <>
              <Button
                size="small"
                variant="text"
                startIcon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />}
                onClick={() => setDecisionDialogOpen(true)}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, mt: 0.25 }}
              >
                Add another decision
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                Saves as structured rows when you {isNew ? 'create' : 'save'} the entry.
              </Typography>
            </>
          )}
        </ListCard>

        <RowCard
          title="Market Sentiment"
          hasValue={market_feeling !== null}
          onClear={() => setMarketFeeling(null)}
        >
          {market_feeling !== null && (
            <Box>
              <Box display="flex" alignItems="baseline" gap={1} sx={{ mb: 0.5 }}>
                <Typography variant="h6" fontWeight={700} sx={{ color: market_feeling > 0 ? '#16a34a' : market_feeling < 0 ? '#dc2626' : '#64748b' }}>
                  {market_feeling > 0 ? '+' : ''}{market_feeling}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {market_feeling <= -7 ? 'Extreme Fear' : market_feeling <= -3 ? 'Fear' : market_feeling <= -1 ? 'Mild Fear' : market_feeling === 0 ? 'Neutral' : market_feeling <= 2 ? 'Mild Optimism' : market_feeling <= 6 ? 'Optimistic' : 'Extreme Greed'}
                </Typography>
              </Box>
              <Slider
                value={market_feeling ?? 0} onChange={(_, v) => setMarketFeeling(v as number)}
                min={-10} max={10} step={1}
                marks={[{ value: -10, label: '-10' }, { value: 0, label: '0' }, { value: 10, label: '+10' }]}
                sx={{ color: market_feeling > 0 ? '#16a34a' : market_feeling < 0 ? '#dc2626' : '#64748b', '& .MuiSlider-markLabel': { fontSize: '0.7rem' } }}
              />
            </Box>
          )}
          {market_feeling === null && (
            <Button variant="outlined" size="small" onClick={() => setMarketFeeling(0)}>
              Set to neutral (0)
            </Button>
          )}
        </RowCard>

        <RowCard
          title="Market Conditions"
          hasValue={market_context.trim().length > 0}
          onClear={() => setMarketContext('')}
        >
          <Box display="flex" gap={0.5} flexWrap="wrap">
            {MARKET_CONDITIONS.map((condition) => {
              const isSelected = market_context.includes(condition)
              return (
                <Chip
                  key={condition}
                  label={condition}
                  size="small"
                  clickable
                  color={isSelected ? 'primary' : 'default'}
                  variant={isSelected ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (isSelected) {
                      setMarketContext(market_context.split(',').map((c) => c.trim()).filter((c) => c !== condition).join(', '))
                    } else {
                      const contexts = market_context.split(',').map((c) => c.trim()).filter(Boolean)
                      setMarketContext([...contexts, condition].join(', '))
                    }
                  }}
                  sx={{ fontWeight: isSelected ? 600 : 400 }}
                />
              )
            })}
          </Box>
        </RowCard>

        <RowCard
          title="Predictions"
          description="Probability + by-date bets. Folds the Calibration tab on /analytics."
          count={predictions.length}
          hasValue={predictions.length > 0}
          forceOpenAt={predictionsOpenAt}
        >
          {predictions.map((p, i) => (
            <ItemRow
              key={p.id ?? `pending-${i}`}
              onDelete={() => {
                if (p.id) setDeletedPredictionIds((prev) => [...prev, p.id as string])
                setPredictions((prev) => prev.filter((_, idx) => idx !== i))
              }}
              ariaLabel="Remove prediction"
            >
              <Typography variant="body2" fontWeight={600}>
                {p.probability >= 0 ? '+' : ''}{p.probability}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                by {p.end_date}
              </Typography>
              {!p.id && (
                <Chip label="unsaved" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.62rem', ml: 'auto' }} />
              )}
            </ItemRow>
          ))}
          <Box display="flex" gap={0.75} alignItems="flex-end" flexWrap="wrap" sx={{ mt: 0.5 }}>
            <TextField
              label="Prediction %" type="number" value={newPredPct}
              onChange={(e) => setNewPredPct(e.target.value)} placeholder="e.g., 15"
              inputProps={{ min: '-100', max: '200', step: '1' }} size="small" sx={{ width: 120 }}
            />
            <TextField
              label="By date" type="date" value={newPredDate}
              onChange={(e) => setNewPredDate(e.target.value)}
              InputLabelProps={{ shrink: true }} size="small" sx={{ width: 160 }}
            />
            <Button
              size="small" variant="outlined"
              disabled={!newPredPct || !newPredDate}
              onClick={() => {
                const probability = Math.min(100, Math.max(-100, parseInt(newPredPct) || 0))
                setPredictions((prev) => [...prev, { probability, end_date: newPredDate }])
                setNewPredPct('')
                setNewPredDate('')
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Add
            </Button>
          </Box>
          <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
            <TextField
              label="Decision horizon" type="date" value={decision_horizon}
              onChange={(e) => setDecisionHorizon(e.target.value)}
              InputLabelProps={{ shrink: true }} size="small" sx={{ minWidth: 160 }}
              helperText="Expected resolution for the whole idea"
            />
          </Box>
        </RowCard>

        <RowCard
          title="Entry Rules"
          description="Conditions that trigger a buy (e.g., break of $100 on volume)."
          count={entryRulesList.length}
          hasValue={entryRulesList.length > 0}
          forceOpenAt={entryRulesOpenAt}
        >
          {entryRulesList.map((rule, i) => (
            <ItemRow
              key={`entry-${i}`}
              onDelete={() => setEntryRulesList((prev) => prev.filter((_, idx) => idx !== i))}
              ariaLabel="Remove entry rule"
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {rule}
              </Typography>
            </ItemRow>
          ))}
          <Box display="flex" gap={0.75} alignItems="center" sx={{ mt: 0.5 }}>
            <TextField
              placeholder="e.g., Break above $100 with volume"
              value={newEntryRule}
              onChange={(e) => setNewEntryRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newEntryRule.trim()) {
                  e.preventDefault()
                  setEntryRulesList((prev) => [...prev, newEntryRule.trim()])
                  setNewEntryRule('')
                }
              }}
              size="small"
              fullWidth
            />
            <Button
              size="small" variant="outlined"
              disabled={!newEntryRule.trim()}
              onClick={() => {
                setEntryRulesList((prev) => [...prev, newEntryRule.trim()])
                setNewEntryRule('')
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Add
            </Button>
          </Box>
        </RowCard>

        <RowCard
          title="Exit Rules"
          description="Conditions that trigger a sell (e.g., stop at $95 or thesis broken)."
          count={exitRulesList.length}
          hasValue={exitRulesList.length > 0}
          forceOpenAt={exitRulesOpenAt}
        >
          {exitRulesList.map((rule, i) => (
            <ItemRow
              key={`exit-${i}`}
              onDelete={() => setExitRulesList((prev) => prev.filter((_, idx) => idx !== i))}
              ariaLabel="Remove exit rule"
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {rule}
              </Typography>
            </ItemRow>
          ))}
          <Box display="flex" gap={0.75} alignItems="center" sx={{ mt: 0.5 }}>
            <TextField
              placeholder="e.g., Stop loss at $95, or thesis broken"
              value={newExitRule}
              onChange={(e) => setNewExitRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newExitRule.trim()) {
                  e.preventDefault()
                  setExitRulesList((prev) => [...prev, newExitRule.trim()])
                  setNewExitRule('')
                }
              }}
              size="small"
              fullWidth
            />
            <Button
              size="small" variant="outlined"
              disabled={!newExitRule.trim()}
              onClick={() => {
                setExitRulesList((prev) => [...prev, newExitRule.trim()])
                setNewExitRule('')
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Add
            </Button>
          </Box>
        </RowCard>
      </Box>

      {/* Sticky save bar — on mobile it pins above the 56-px BottomNav
          so the user never has to scroll-then-hunt for the button after
          finishing a long entry. Desktop keeps the inline behaviour
          since the button stays visible at the natural form bottom. */}
      <Box
        display="flex"
        gap={1.5}
        alignItems="center"
        sx={{
          mt: 1,
          position: { xs: 'sticky', sm: 'static' },
          bottom: { xs: 56, sm: 'auto' },
          bgcolor: { xs: 'background.default', sm: 'transparent' },
          pt: { xs: 1, sm: 0 },
          pb: { xs: 1, sm: 0 },
          borderTop: { xs: '1px solid', sm: 'none' },
          borderColor: 'divider',
          mx: { xs: -1.5, sm: 0 },
          px: { xs: 1.5, sm: 0 },
          zIndex: 4,
        }}
      >
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={saving || (!title_markdown.trim() && !body_markdown.trim())}
          title="Save entry (Ctrl+S / Cmd+S or Ctrl+Enter / Cmd+Enter)"
          sx={{ textTransform: 'none', fontWeight: 600, px: 3 }}
        >
          {saving ? <CircularProgress size={22} /> : isNew ? 'Create entry' : 'Save changes'}
        </Button>
        {/* Visible keyboard-shortcut hint — saves a hover. */}
        <Box
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            alignItems: 'center',
            gap: 0.5,
            color: 'text.secondary',
            fontSize: '0.72rem',
          }}
        >
          <Box
            component="kbd"
            sx={{
              px: 0.5, py: 0.125,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0.5,
              bgcolor: 'background.paper',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'text.primary',
              lineHeight: 1.4,
            }}
          >
            ⌘S
          </Box>
          <Box component="span">or</Box>
          <Box
            component="kbd"
            sx={{
              px: 0.5, py: 0.125,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0.5,
              bgcolor: 'background.paper',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'text.primary',
              lineHeight: 1.4,
            }}
          >
            ⌘↵
          </Box>
        </Box>
        <Button
          component={RouterLink}
          variant="text"
          color="inherit"
          to={isNew ? '/' : `/entries/${id}`}
          onClick={(e: React.MouseEvent) => {
            const isDirty =
              title_markdown !== initialValuesRef.current.title_markdown ||
              body_markdown !== initialValuesRef.current.body_markdown ||
              tagsStr !== initialValuesRef.current.tagsStr
            if (isDirty) {
              // Stay-in-the-flow warning — instead of a terse
              // "Discard unsaved changes?" bark, give the writer a
              // soft reminder of what they were just doing. If they
              // were typing within the last 60s, emphasize that.
              const typingRecently = lastSaveRef.current === 0
                || Date.now() - lastSaveRef.current < 60_000
              const msg = typingRecently && sessionWordsWritten > 0
                ? `You were writing — ${sessionWordsWritten} word${sessionWordsWritten === 1 ? '' : 's'} added in this session. Leave without saving?`
                : 'Leave without saving?'
              if (!window.confirm(msg)) {
                e.preventDefault()
                return
              }
            }
            if (isNew) clearDraft()
          }}
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          Cancel
        </Button>
      </Box>

      {/* Decision dialog — opens from the Decisions card's + button. */}
      <InsertDecisionBlockDialog
        open={decisionDialogOpen}
        onClose={() => setDecisionDialogOpen(false)}
        onInsert={handleInsertDecisionBlock}
        defaultTicker={titleTickerHint}
      />
      <SlashMenuDialog
        open={slashMenuOpen}
        onClose={() => setSlashMenuOpen(false)}
        onInsertDecision={() => setDecisionDialogOpen(true)}
        onInsertDate={() => {
          // Drop a newspaper-style date line at the caret. The
          // render path will pick it up as plain prose.
          const d = new Date().toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric',
          })
          setBodyMarkdown((prev) => (prev + (prev.endsWith('\n') || prev === '' ? '' : ' ') + d))
        }}
        onFocusPrediction={() => {
          // Turn focus mode off (so the card is in layout), expand
          // the RowCard via its force-open signal, then scroll it
          // into view. The two-step (expand → wait → scroll) avoids
          // scrolling to a collapsed target the user then has to
          // click + on.
          setFocusMode(false)
          setPredictionsOpenAt(Date.now())
          scrollCardIntoView('Predictions')
        }}
        onFocusWatchlist={() => navigate('/watchlist/new')}
        onFocusEntryRules={() => {
          setFocusMode(false)
          setEntryRulesOpenAt(Date.now())
          scrollCardIntoView('Entry Rules')
        }}
        onFocusExitRules={() => {
          setFocusMode(false)
          setExitRulesOpenAt(Date.now())
          scrollCardIntoView('Exit Rules')
        }}
      />
    </Box>
  )
}
