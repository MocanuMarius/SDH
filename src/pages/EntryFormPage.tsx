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
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../contexts/AuthContext'
import { createEntry, updateEntry } from '../services/entriesService'
import { createPrediction } from '../services/predictionsService'
import { createAction } from '../services/actionsService'
import { ensurePassedForUser } from '../services/passedService'
import { buildDecisionBlockMarkdown, type DecisionBlockFields } from '../utils/decisionBlockMarkdown'
import { stripLegacyMarkdown } from '../utils/stripLegacyMarkdown'
import type { ActionInsert } from '../types/database'
import { PageHeader } from '../components/system'
import { generateEntryId } from '../utils/id'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useEntry, useInvalidate } from '../hooks/queries'
import InsertDecisionBlockDialog from '../components/InsertDecisionBlockDialog'
import TickerDollarField from '../components/TickerDollarField'
import DecisionChip from '../components/DecisionChip'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { getTagPresets } from '../utils/tagPresets'
import TagChip from '../components/TagChip'

const getToday = () => new Date().toISOString().slice(0, 10)

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
  children,
}: {
  title: string
  description?: string
  hasValue: boolean
  /** Optional one-line preview shown when collapsed AND a value is present (rare since hasValue=true keeps it open). */
  summary?: React.ReactNode
  onClear: () => void
  children: React.ReactNode
}) {
  const [manuallyOpen, setManuallyOpen] = useState(false)
  const open = manuallyOpen || hasValue
  const handleHeaderClick = () => {
    if (!open) setManuallyOpen(true)
  }
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      onClear()
      setManuallyOpen(false)
    } else {
      setManuallyOpen(true)
    }
  }
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
          <Typography variant="body2" fontWeight={700} color="text.primary">{title}</Typography>
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
          aria-label={open ? `Remove ${title}` : `Add ${title}`}
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
  const [entryRules, setEntryRules] = useState('')
  const [exitRules, setExitRules] = useState('')
  const [predictionPercent, setPredictionPercent] = useState('')
  const [predictionDate, setPredictionDate] = useState('')
  const [decision_horizon, setDecisionHorizon] = useState('')
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const initialValuesRef = useRef({ title_markdown: '', body_markdown: '', tagsStr: '' })

  // Tag presets for autocomplete
  const tagPresets = useMemo(() => getTagPresets().map((p) => p.label), [])

  // Parse comma-separated tags string into array for Autocomplete
  const tagValues = useMemo(() =>
    tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
    [tagsStr]
  )

  // Auto-save draft to localStorage every 30s (new entries only)
  const DRAFT_KEY = 'sdh_entry_draft'
  const lastSaveRef = useRef(0)

  useEffect(() => {
    if (!isNew) return
    // Restore draft on mount (never restore date — always use today)
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, string>
        if (draft.title_markdown) setTitleMarkdown(draft.title_markdown)
        if (draft.body_markdown) setBodyMarkdown(draft.body_markdown)
        if (draft.tagsStr) setTagsStr(draft.tagsStr)
        // Date intentionally not restored — always default to today
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
    if (url) setBodyMarkdown(`[${title || 'Shared article'}](${url})`)

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
      lastSaveRef.current = now
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title_markdown, body_markdown, tagsStr,
      }))
    }, 30000)
    return () => clearInterval(timer)
  }, [isNew, title_markdown, body_markdown, tagsStr])

  // Clear draft on successful save
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY)
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
      if (entryIdx >= 0) setEntryRules(lines[entryIdx].replace('Entry:', '').trim())
      if (exitIdx >= 0) setExitRules(lines[exitIdx].replace('Exit:', '').trim())
    }
  }, [isNew, editEntryQ.data, editEntryQ.isLoading, editEntryQ.error])

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

      // Ctrl/Cmd+B: Insert Buy decision block
      if (modifier && e.key === 'b') {
        e.preventDefault()
        setBodyTab('decision')
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
      raw_snippet: buildDecisionBlockMarkdown(block),
    }
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
      // Build trading plan string
      const tradingPlan = entryRules || exitRules
        ? [
            entryRules && `Entry: ${entryRules}`,
            exitRules && `Exit: ${exitRules}`,
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
      if (entryId && pendingDecisions.length > 0) {
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
          } catch (actionErr) {
            console.warn('Failed to auto-promote decision block:', actionErr)
          }
        }
        invalidate.actions()
        invalidate.passed()
        setPendingDecisions([])
      }

      invalidate.entries()
      showSuccess(isNew ? 'Entry created' : 'Entry saved')
      if (entryId) navigate(`/entries/${entryId}`)

      // Save prediction if one was entered
      if (entryId && predictionPercent && predictionDate) {
        try {
          const probability = Math.min(100, Math.max(0, parseInt(predictionPercent) || 0))
          await createPrediction({
            entry_id: entryId,
            probability,
            end_date: predictionDate,
            type: 'idea',
            label: `${probability}% by ${predictionDate}`,
            ticker: null,
          })
          invalidate.predictions(entryId)
        } catch (predErr) {
          console.warn('Failed to save prediction:', predErr)
          // Don't fail the entire save if prediction fails
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
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Title + Date on one row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <TickerDollarField
          fullWidth
          size="small"
          value={title_markdown}
          onChange={setTitleMarkdown}
          placeholder="Title with $TICKER"
          sx={{ flex: 1 }}
        />
        <TextField
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 140, flexShrink: 0 }}
        />
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

      {/* Body editor — pure thesis textarea. The decision entry lives in its own
          Decisions card below, alongside the other structured fields. */}
      <Paper variant="outlined" sx={{ mb: 1.5, bgcolor: 'background.paper' }}>
        <TickerDollarField
          fullWidth
          multiline
          minRows={6}
          value={body_markdown}
          onChange={setBodyMarkdown}
          placeholder="Write your thesis…"
          sx={{
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiInputBase-root': { borderRadius: 0 },
          }}
        />
      </Paper>

      {/* Optional context — each row is a mini card that expands on + click. */}
      <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Decisions — first-class card, always visible, inline list + "+ Add" button.
            Replaces the old top-right corner Add Decision button. */}
        <Paper
          variant="outlined"
          sx={{
            overflow: 'hidden',
            bgcolor: pendingDecisions.length > 0 ? 'background.paper' : 'grey.50',
            borderColor: pendingDecisions.length > 0 ? 'primary.light' : 'divider',
            transition: 'background-color 120ms, border-color 120ms',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box display="flex" alignItems="baseline" gap={0.75}>
                <Typography variant="body2" fontWeight={700} color="text.primary">
                  Decisions
                </Typography>
                {pendingDecisions.length > 0 && (
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    ({pendingDecisions.length})
                  </Typography>
                )}
              </Box>
              {pendingDecisions.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.72rem', mt: 0.25 }}>
                  Buys, sells, passes, research notes — what you did or decided.
                </Typography>
              )}
            </Box>
            <IconButton
              size="small"
              onClick={() => setDecisionDialogOpen(true)}
              aria-label="Add decision"
              sx={{
                color: 'primary.contrastText',
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
                width: 28,
                height: 28,
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
          {pendingDecisions.length > 0 && (
            <Box sx={{ px: 1.5, pb: 1.5, pt: 0.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <AnimatePresence initial={false}>
                {pendingDecisions.map((d, i) => (
                  <motion.div
                    key={`${d.ticker}-${d.type}-${d.action_date}-${i}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
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
                      <IconButton
                        size="small"
                        onClick={() => setPendingDecisions((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove decision"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </motion.div>
                ))}
              </AnimatePresence>
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
            </Box>
          )}
        </Paper>

        <RowCard
          title="Market Sentiment"
          description="How bullish or bearish the overall market feels to you"
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
          description="Tag the backdrop (bull / bear / earnings season / …)"
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
          title="Prediction"
          description="A falsifiable forecast with a target date"
          hasValue={Boolean(predictionPercent || predictionDate || decision_horizon)}
          onClear={() => { setPredictionPercent(''); setPredictionDate(''); setDecisionHorizon('') }}
        >
          <Box display="flex" gap={2} flexWrap="wrap">
            <TextField label="Prediction %" type="number" value={predictionPercent}
              onChange={(e) => setPredictionPercent(e.target.value)} placeholder="e.g., 15"
              inputProps={{ min: '-100', max: '200', step: '1' }} size="small" sx={{ minWidth: 110 }}
            />
            <TextField label="By Date" type="date" value={predictionDate}
              onChange={(e) => setPredictionDate(e.target.value)}
              InputLabelProps={{ shrink: true }} size="small" sx={{ minWidth: 140 }}
            />
            <TextField label="Decision Horizon" type="date" value={decision_horizon}
              onChange={(e) => setDecisionHorizon(e.target.value)}
              InputLabelProps={{ shrink: true }} size="small" sx={{ minWidth: 140 }}
              helperText="Expected resolution"
            />
          </Box>
        </RowCard>

        <RowCard
          title="Entry Rules"
          description="When you'd enter the position"
          hasValue={entryRules.trim().length > 0}
          onClear={() => setEntryRules('')}
        >
          <TextField
            placeholder="e.g., Break above $100 with volume"
            value={entryRules}
            onChange={(e) => setEntryRules(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
        </RowCard>

        <RowCard
          title="Exit Rules"
          description="When you'd reassess or close the position"
          hasValue={exitRules.trim().length > 0}
          onClear={() => setExitRules('')}
        >
          <TextField
            placeholder="e.g., Stop loss at $95, or thesis broken"
            value={exitRules}
            onChange={(e) => setExitRules(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
        </RowCard>
      </Box>

      <Box display="flex" gap={1.5} alignItems="center" sx={{ mt: 1 }}>
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
            if (isDirty && !window.confirm('Discard unsaved changes?')) {
              e.preventDefault()
              return
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
    </Box>
  )
}
