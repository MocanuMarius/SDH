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
  Tabs,
  Tab,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import { useAuth } from '../contexts/AuthContext'
import { getEntry, createEntry, updateEntry } from '../services/entriesService'
import { createFeeling } from '../services/feelingsService'
import { createPrediction } from '../services/predictionsService'
import { generateEntryId } from '../utils/id'
import { useSnackbar } from '../contexts/SnackbarContext'
import InsertDecisionBlockDialog from '../components/InsertDecisionBlockDialog'
import FeelingFormDialog from '../components/FeelingFormDialog'
import TickerDollarField from '../components/TickerDollarField'
import MarkdownRender from '../components/MarkdownRender'
import { getTagPresets } from '../utils/tagPresets'
import TagChip from '../components/TagChip'
import type { FeelingType } from '../types/database'

const getToday = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  get date() { return getToday() },
  author: '',
  tags: [] as string[],
  title_markdown: '',
  body_markdown: '',
  market_context: '',
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
  const [feelingDialogOpen, setFeelingDialogOpen] = useState(false)
  const [pendingFeelingType, setPendingFeelingType] = useState<FeelingType>('market')
  const [tradingPlanExpanded, setTradingPlanExpanded] = useState(false)
  const [entryRules, setEntryRules] = useState('')
  const [exitRules, setExitRules] = useState('')
  const [riskLimit, setRiskLimit] = useState('')
  const [profitTarget, setProfitTarget] = useState('')
  const [predictionPercent, setPredictionPercent] = useState('')
  const [predictionDate, setPredictionDate] = useState('')
  const [decision_horizon, setDecisionHorizon] = useState('')
  const [bodyTab, setBodyTab] = useState<'write' | 'preview' | 'decision'>('write')
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

  useEffect(() => {
    if (isNew || !id) {
      setLoading(false)
      return
    }
    let cancelled = false
    getEntry(id)
      .then((entry) => {
        if (!cancelled && entry) {
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
            setTradingPlanExpanded(true)
            const lines = entry.trading_plan.split('\n')
            const entryIdx = lines.findIndex((l) => l.startsWith('Entry:'))
            const exitIdx = lines.findIndex((l) => l.startsWith('Exit:'))
            const riskIdx = lines.findIndex((l) => l.startsWith('Risk:'))
            const profitIdx = lines.findIndex((l) => l.startsWith('Profit:'))
            if (entryIdx >= 0) setEntryRules(lines[entryIdx].replace('Entry:', '').trim())
            if (exitIdx >= 0) setExitRules(lines[exitIdx].replace('Exit:', '').trim())
            if (riskIdx >= 0) setRiskLimit(lines[riskIdx].replace('Risk:', '').trim())
            if (profitIdx >= 0) setProfitTarget(lines[profitIdx].replace('Profit:', '').trim())
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load entry')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id, isNew])

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

      // Ctrl/Cmd+Shift+M: Open market feeling dialog (only on edit, not new)
      if (modifier && e.shiftKey && e.key === 'M') {
        e.preventDefault()
        if (!isNew) {
          setPendingFeelingType('market')
          setFeelingDialogOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isNew])

  const tags = tagsStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const handleInsertDecisionBlock = (markdown: string) => {
    const sep = body_markdown.trim() ? '\n\n' : ''
    setBodyMarkdown((prev) => prev + sep + markdown)
  }

  const handleFeelingSubmit = async (data: { score: number; label: string; type: FeelingType; ticker: string }) => {
    if (!id || isNew) {
      throw new Error('Entry must be saved before adding a feeling')
    }
    const entryId = id
    await createFeeling({
      entry_id: entryId,
      score: data.score,
      label: data.label,
      type: data.type,
      ticker: data.ticker,
    })
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
      const tradingPlan = entryRules || exitRules || riskLimit || profitTarget
        ? [
            entryRules && `Entry: ${entryRules}`,
            exitRules && `Exit: ${exitRules}`,
            riskLimit && `Risk: ${riskLimit}`,
            profitTarget && `Profit: ${profitTarget}`,
          ]
            .filter(Boolean)
            .join('\n')
        : null

      const entryData = {
        date,
        author: author || (user.email ?? ''),
        tags,
        title_markdown,
        body_markdown,
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
        showSuccess('Entry created')
        navigate(`/entries/${entry.id}`)
      } else if (id) {
        await updateEntry(id, entryData)
        showSuccess('Entry saved')
        navigate(`/entries/${id}`)
      }

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
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        {isNew ? 'New decision' : 'Edit decision'}
      </Typography>
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

      {/* Editor area with tabs: Write | Preview | + Decision */}
      <Paper variant="outlined" sx={{ mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          {bodyTab === 'decision' ? (
            <Button
              size="small"
              onClick={() => setBodyTab('write')}
              sx={{ textTransform: 'none', fontSize: '0.8rem', minHeight: 34, px: 1.5, gap: 0.5 }}
            >
              ← Back to editor
            </Button>
          ) : (
            <>
              <Tabs
                value={bodyTab}
                onChange={(_, v) => setBodyTab(v as 'write' | 'preview')}
                sx={{ flex: 1, minHeight: 34, '& .MuiTab-root': { minHeight: 34, py: 0.25, textTransform: 'none', fontSize: '0.8rem' } }}
              >
                <Tab label="Write" value="write" />
                <Tab label="Preview" value="preview" />
              </Tabs>
              <Button
                size="small"
                startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
                onClick={() => setBodyTab('decision')}
                sx={{ textTransform: 'none', fontSize: '0.75rem', mr: 0.5, whiteSpace: 'nowrap' }}
              >
                Decision
              </Button>
            </>
          )}
        </Box>
        {bodyTab !== 'decision' && (
          <>
            {/* Tags row inside editor */}
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={tagPresets}
              value={tagValues}
              onChange={(_, newVal) => setTagsStr(newVal.join(', '))}
              renderTags={(value, getTagProps) =>
                value.map((opt, idx) => (
                  <TagChip key={opt} tag={opt} size="small" {...getTagProps({ index: idx })} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} placeholder="Tags" variant="standard"
                  sx={{ '& .MuiInput-underline:before': { borderBottom: 'none' }, '& .MuiInput-underline:after': { borderBottom: 'none' }, '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' } }}
                />
              )}
              sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider' }}
            />
            {bodyTab === 'write' ? (
              <TickerDollarField
                fullWidth
                multiline
                minRows={6}
                value={body_markdown}
                onChange={setBodyMarkdown}
                placeholder="Write your thesis... (markdown supported, $ for tickers)"
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  '& .MuiInputBase-root': { borderRadius: 0 },
                }}
              />
            ) : (
              <Box sx={{ p: 2, minHeight: 200 }}>
                {body_markdown.trim() ? (
                  <MarkdownRender source={body_markdown} />
                ) : (
                  <Typography color="text.secondary" variant="body2" fontStyle="italic">
                    Nothing to preview yet — switch to Write and start typing.
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
        {bodyTab === 'decision' && (
          <InsertDecisionBlockDialog
            open={true}
            onClose={() => setBodyTab('write')}
            onInsert={handleInsertDecisionBlock}
            inline
          />
        )}
      </Paper>

      {/* Collapsible advanced options — always visible (new + edit) */}
      <Paper variant="outlined" sx={{ mb: 2, bgcolor: 'background.paper' }}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
          onClick={() => setTradingPlanExpanded(!tradingPlanExpanded)}
        >
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            More
          </Typography>
          <IconButton size="small" sx={{ transform: tradingPlanExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
            <ExpandMoreIcon />
          </IconButton>
        </Box>
        <Collapse in={tradingPlanExpanded}>
          <Box sx={{ p: 2, pt: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Market Sentiment */}
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Market Sentiment
              </Typography>
              {market_feeling === null ? (
                <Button variant="outlined" size="small" onClick={() => setMarketFeeling(0)}>
                  + Set sentiment score
                </Button>
              ) : (
                <Box>
                  <Box display="flex" alignItems="baseline" gap={1} sx={{ mb: 0.5 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ color: market_feeling > 0 ? '#16a34a' : market_feeling < 0 ? '#dc2626' : '#64748b' }}>
                      {market_feeling > 0 ? '+' : ''}{market_feeling}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {market_feeling <= -7 ? 'Extreme Fear' : market_feeling <= -3 ? 'Fear' : market_feeling <= -1 ? 'Mild Fear' : market_feeling === 0 ? 'Neutral' : market_feeling <= 2 ? 'Mild Optimism' : market_feeling <= 6 ? 'Optimistic' : 'Extreme Greed'}
                    </Typography>
                    <Button size="small" variant="text" color="inherit" sx={{ fontSize: '0.7rem', p: 0, ml: 'auto' }} onClick={() => setMarketFeeling(null)}>
                      Clear
                    </Button>
                  </Box>
                  <Slider
                    value={market_feeling} onChange={(_, v) => setMarketFeeling(v as number)}
                    min={-10} max={10} step={1}
                    marks={[{ value: -10, label: '-10' }, { value: 0, label: '0' }, { value: 10, label: '+10' }]}
                    sx={{ color: market_feeling > 0 ? '#16a34a' : market_feeling < 0 ? '#dc2626' : '#64748b', '& .MuiSlider-markLabel': { fontSize: '0.7rem' } }}
                  />
                </Box>
              )}
            </Box>

            {/* Market Conditions */}
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Market Conditions
              </Typography>
              <Box display="flex" gap={0.5} flexWrap="wrap">
                {MARKET_CONDITIONS.map((condition) => {
                  const isSelected = market_context.includes(condition)
                  return (
                    <Button key={condition} size="small" variant={isSelected ? 'contained' : 'outlined'}
                      sx={{ fontSize: '0.75rem', py: 0.25, px: 1 }}
                      onClick={() => {
                        if (isSelected) {
                          setMarketContext(market_context.split(',').map((c) => c.trim()).filter((c) => c !== condition).join(', '))
                        } else {
                          const contexts = market_context.split(',').map((c) => c.trim()).filter(Boolean)
                          setMarketContext([...contexts, condition].join(', '))
                        }
                      }}
                    >
                      {condition}
                    </Button>
                  )
                })}
              </Box>
            </Box>

            {/* Prediction + Horizon row */}
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

            {/* Trading Plan */}
            <Box display="flex" gap={1.5} flexDirection="column">
              <Typography variant="caption" fontWeight={600} color="text.secondary">Trading Plan</Typography>
              <Box display="flex" gap={1.5} flexWrap="wrap">
                <TextField label="Entry Rules" placeholder="e.g., Break above $100" value={entryRules}
                  onChange={(e) => setEntryRules(e.target.value)} size="small" sx={{ flex: 1, minWidth: 200 }} />
                <TextField label="Exit Rules" placeholder="e.g., Stop loss at $95" value={exitRules}
                  onChange={(e) => setExitRules(e.target.value)} size="small" sx={{ flex: 1, minWidth: 200 }} />
              </Box>
              <Box display="flex" gap={1.5}>
                <TextField label="Risk Limit" placeholder="e.g., 2%" value={riskLimit}
                  onChange={(e) => setRiskLimit(e.target.value)} size="small" sx={{ flex: 1 }} />
                <TextField label="Profit Target" placeholder="e.g., 15%" value={profitTarget}
                  onChange={(e) => setProfitTarget(e.target.value)} size="small" sx={{ flex: 1 }} />
              </Box>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      <Box display="flex" gap={1}>
        <Button
          type="submit"
          variant="contained"
          disabled={saving || (!title_markdown.trim() && !body_markdown.trim())}
          title="Save entry (Ctrl+S / Cmd+S or Ctrl+Enter / Cmd+Enter)"
        >
          {saving ? <CircularProgress size={24} /> : isNew ? 'Create' : 'Save'}
        </Button>
        <Button
          component={RouterLink}
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
        >
          Cancel
        </Button>
      </Box>

      <FeelingFormDialog
        open={feelingDialogOpen}
        onClose={() => setFeelingDialogOpen(false)}
        onSubmit={handleFeelingSubmit}
        initial={{
          id: '',
          entry_id: id || '',
          score: 5,
          label: '',
          type: pendingFeelingType,
          ticker: '',
          created_at: '',
          updated_at: '',
        }}
      />
    </Box>
  )
}
