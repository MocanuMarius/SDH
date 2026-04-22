import { useState } from 'react'
import { Alert, Box, Button, Chip, IconButton, Tooltip, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import TickerLinks from './TickerLinks'
import PlainTextWithTickers from './PlainTextWithTickers'
import RelativeDate from './RelativeDate'
import DecisionChip from './DecisionChip'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'
import OptionTypeChip from './OptionTypeChip'
import { getDecisionTypeColor } from '../theme/decisionTypes'
import { useTickerChart } from '../contexts/TickerChartContext'
import type { Action, Outcome } from '../types/database'
import { ERROR_TYPE_LABELS } from '../utils/errorTypeLabels'

function parsePrice(price: string | null | undefined): number | null {
  if (price == null || typeof price !== 'string') return null
  const n = Number(price.replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

interface DecisionCardProps {
  action: Action
  outcome?: Outcome | null
  /** When no outcome (open position), optional current price for unrealized P&L */
  currentPrice?: number | null
  onAddOrEditOutcome: () => void
  /** Quick-verdict save — when provided and no outcome exists,
   *  three chips appear for one-click close (Right / Wrong /
   *  Inconclusive). The host handles the actual createOutcome
   *  call. Async so the card can disable itself during the save. */
  onQuickVerdict?: (verdict: 'right' | 'wrong' | 'inconclusive') => Promise<void>
  onDelete: () => void
  /** Open the focused decision-edit dialog for this action. */
  onEdit?: () => void
  /** When true, play a "filed away" flourish on this card. Used on
   *  the post-outcome-save return from OutcomeFormPage. */
  justClosed?: boolean
}

/** Journalytic-style decision card: blockquote layout with $TICKER, Date, Price, Reason, Expanded Reasoning */
export default function DecisionCard({ action, outcome, currentPrice, onAddOrEditOutcome, onQuickVerdict, onDelete, onEdit, justClosed }: DecisionCardProps) {
  const { openChart } = useTickerChart()
  const tickerLabel = action.ticker ? getTickerDisplayLabel(action.ticker) : null
  const borderColor = getDecisionTypeColor(action.type)

  // Local "saving" lock so the three quick-verdict chips disable
  // while the parent is round-tripping the createOutcome call.
  const [quickSaving, setQuickSaving] = useState<'right' | 'wrong' | 'inconclusive' | null>(null)
  const handleQuick = async (verdict: 'right' | 'wrong' | 'inconclusive') => {
    if (!onQuickVerdict || quickSaving) return
    setQuickSaving(verdict)
    try {
      await onQuickVerdict(verdict)
    } finally {
      setQuickSaving(null)
    }
  }
  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor,
        pl: { xs: 1.25, sm: 2 },
        py: 1.5,
        pr: { xs: 1, sm: 1 },
        my: 1.5,
        bgcolor: 'grey.50',
        borderRadius: 1,
        // Post-save flourish — briefly glow + lift when the card has
        // just been closed. Caller clears `justClosed` after a moment.
        transition: 'box-shadow 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...(justClosed
          ? {
              boxShadow: `0 0 0 2px ${borderColor}40, 0 12px 28px rgba(15, 23, 42, 0.12)`,
              transform: 'translateY(-1px)',
            }
          : {}),
      }}
    >
      {/* On mobile the main content needs the full row width — the action
          buttons sit below. On desktop they float to the right as before. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
            <DecisionChip type={action.type} size="small" />
            <Typography component="span" variant="caption" color="text.secondary">
              <RelativeDate date={action.action_date} variant="caption" sx={{ color: 'inherit' }} />
            </Typography>
            {/* Show the trade size when it's been explicitly set to something
                other than the default 'medium' — keeps the card quiet for the
                95% default case, flags unusual sizes when they matter. */}
            {action.size && action.size !== 'medium' && (
              <Chip
                size="small"
                variant="outlined"
                label={
                  action.size === 'tiny' ? 'Tiny size'
                    : action.size === 'small' ? 'Small size'
                    : action.size === 'large' ? 'Large size'
                    : 'XL size'
                }
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>
          {tickerLabel && (
            <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={tickerLabel}
                component={RouterLink}
                to={`/tickers/${encodeURIComponent(normalizeTickerToCompany(action.ticker) || action.ticker.toUpperCase())}`}
                sx={{ fontWeight: 600, textDecoration: 'none' }}
                clickable
              />
              <Tooltip title="Quick chart">
                <IconButton size="small" onClick={() => openChart(action.ticker)} sx={{ p: 0.25 }}>
                  <ShowChartIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <OptionTypeChip action={action} />
              {action.company_name && (
                <Typography component="span" variant="body2" color="text.secondary">
                  — {action.company_name}
                </Typography>
              )}
            </Box>
          )}
          <Box component="dl" sx={{ m: 0, '& dd': { m: 0 }, '& dt': { display: 'inline', fontWeight: 600 }, '& dd + dt': { mt: 0.5 } }}>
            {(action.price != null && action.price !== '') && (
              <Typography component="div" variant="body2">
                <Box component="span" sx={{ fontWeight: 600 }}>Price:</Box> {action.price} {action.currency || ''}
                {action.shares != null && action.shares > 0 && ` · ${action.shares} shares`}
                {action.market_value != null && action.market_value > 0 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                    · MV {action.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })} {action.currency || ''}
                  </Typography>
                )}
              </Typography>
            )}
            {/* Market value with no Price line — show on its own row
                so futures / structured trades that only carry MV
                still surface their position size. */}
            {(!action.price || action.price === '') && action.market_value != null && action.market_value > 0 && (
              <Typography component="div" variant="body2">
                <Box component="span" sx={{ fontWeight: 600 }}>Market value:</Box> {action.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })} {action.currency || ''}
              </Typography>
            )}
            {action.reason && (
              <Typography component="div" variant="body2">
                <Box component="span" sx={{ fontWeight: 600 }}>Reason:</Box> <TickerLinks text={action.reason} variant="chip" dense />
              </Typography>
            )}
            {action.notes && (
              <Box sx={{ mt: 0.5 }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>Expanded reasoning: </Typography>
                <Box sx={{ '& p': { m: 0 }, '& p + p': { mt: 0.5 }, display: 'inline-block', width: '100%' }}>
                  <PlainTextWithTickers source={action.notes} dense />
                </Box>
              </Box>
            )}
            {action.kill_criteria && (
              <Box sx={{ mt: 0.5 }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>Kill criteria: </Typography>
                <Typography component="span" variant="body2" color="warning.main">
                  <TickerLinks text={action.kill_criteria} variant="chip" dense />
                </Typography>
              </Box>
            )}
            {action.pre_mortem_text && (
              <Box sx={{ mt: 0.5 }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>Pre-mortem: </Typography>
                <Box sx={{ '& p': { m: 0 }, '& p + p': { mt: 0.5 }, display: 'inline-block', width: '100%' }}>
                  <PlainTextWithTickers source={action.pre_mortem_text} dense />
                </Box>
              </Box>
            )}
            {!outcome && (action.type === 'buy' || action.type === 'add_more') && action.ticker && currentPrice != null && (() => {
              const decisionPrice = parsePrice(action.price)
              if (decisionPrice == null || decisionPrice <= 0) return null
              const pct = ((currentPrice - decisionPrice) / decisionPrice) * 100
              const dollars = action.shares != null && action.shares > 0 ? (currentPrice - decisionPrice) * action.shares : null
              return (
                <Typography component="div" variant="body2" sx={{ mt: 0.5 }} color={pct >= 0 ? 'success.main' : 'error.main'}>
                  <Box component="span" sx={{ fontWeight: 600 }}>Unrealized:</Box> {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>· Now {currentPrice.toFixed(2)}</Typography>
                  {dollars != null && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>· {dollars >= 0 ? '+' : ''}${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Typography>}
                </Typography>
              )
            })()}
          </Box>
          {outcome && (
            <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
              {outcome.process_quality === 'bad' && outcome.outcome_quality === 'good' && (
                <Alert severity="warning" sx={{ mb: 1, py: 0.5 }} icon={false}>
                  <Typography variant="body2">
                    <strong>Dumb luck.</strong> Good result from a flawed process — dangerous to repeat. Add a post-mortem to learn from it.
                  </Typography>
                  <Button size="small" onClick={onAddOrEditOutcome} sx={{ mt: 0.5 }}>
                    Edit outcome
                  </Button>
                </Alert>
              )}
              <Typography variant="caption" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 600 }}>Outcome:</Box>{' '}
                {outcome.outcome_date}
                {outcome.realized_pnl != null && ` · P&L ${outcome.realized_pnl}`}
                {outcome.driver && ` · Driver: ${outcome.driver === 'thesis' ? 'Thesis' : 'Other'}`}
                {outcome.process_quality && outcome.outcome_quality && (
                  <> · Process: {outcome.process_quality} · Outcome: {outcome.outcome_quality}</>
                )}
                {outcome.notes && <> · <TickerLinks text={outcome.notes} variant="link" dense /></>}
              </Typography>
              {outcome.error_type?.length ? (
                <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }} color="text.secondary">
                  <Box component="span" sx={{ fontWeight: 600 }}>Error type:</Box>{' '}
                  {outcome.error_type.map((t) => ERROR_TYPE_LABELS[t]).join(', ')}
                </Typography>
              ) : null}
              {outcome.post_mortem_notes && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>Post-mortem: </Typography>
                  <Box sx={{ '& p': { m: 0 }, color: 'text.secondary' }}>
                    <PlainTextWithTickers source={outcome.post_mortem_notes} dense />
                  </Box>
                </Box>
              )}
              {outcome.what_i_remember_now && action.reason && (
                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    Compare then vs now (hindsight bias check)
                  </Typography>
                  <Typography variant="body2" component="div">
                    <Box component="span" sx={{ fontWeight: 600 }}>What I wrote then:</Box> <TickerLinks text={action.reason} variant="chip" dense />
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }} component="div">
                    <Box component="span" sx={{ fontWeight: 600 }}>What I remember now:</Box> <TickerLinks text={outcome.what_i_remember_now} variant="chip" dense />
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Gap between the two may indicate hindsight bias.
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            alignSelf: { xs: 'flex-end', sm: 'flex-start' },
            flexWrap: 'wrap',
            justifyContent: { xs: 'flex-end', sm: 'flex-start' },
          }}
        >
          {/* When no outcome + quick-verdict is wired, show three
              one-click close chips. Covers the common case ("I just
              sold, mark it Right") without opening the full form.
              A small italic "Add details →" link routes to the full
              OutcomeFormPage for writers who want to reflect. */}
          {!outcome && onQuickVerdict && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label="Right"
                size="small"
                disabled={quickSaving != null}
                onClick={() => handleQuick('right')}
                sx={{
                  bgcolor: quickSaving === 'right' ? '#16a34a' : 'transparent',
                  color: quickSaving === 'right' ? '#fff' : '#16a34a',
                  borderColor: '#16a34a',
                  border: '1px solid',
                  fontWeight: 600,
                  '&:hover': { bgcolor: '#16a34a18', borderColor: '#16a34a' },
                }}
              />
              <Chip
                label="Wrong"
                size="small"
                disabled={quickSaving != null}
                onClick={() => handleQuick('wrong')}
                sx={{
                  bgcolor: quickSaving === 'wrong' ? '#dc2626' : 'transparent',
                  color: quickSaving === 'wrong' ? '#fff' : '#dc2626',
                  borderColor: '#dc2626',
                  border: '1px solid',
                  fontWeight: 600,
                  '&:hover': { bgcolor: '#dc262618', borderColor: '#dc2626' },
                }}
              />
              <Chip
                label="Unclear"
                size="small"
                disabled={quickSaving != null}
                onClick={() => handleQuick('inconclusive')}
                sx={{
                  bgcolor: quickSaving === 'inconclusive' ? '#64748b' : 'transparent',
                  color: quickSaving === 'inconclusive' ? '#fff' : '#64748b',
                  borderColor: '#64748b',
                  border: '1px solid',
                  fontWeight: 600,
                  '&:hover': { bgcolor: '#64748b18', borderColor: '#64748b' },
                }}
              />
              <Button
                size="small"
                variant="text"
                onClick={onAddOrEditOutcome}
                sx={{ textTransform: 'none', fontStyle: 'italic', fontSize: '0.78rem', minWidth: 0, px: 0.5 }}
              >
                Details →
              </Button>
            </Box>
          )}
          {(outcome || !onQuickVerdict) && (
            <Button size="small" variant="text" onClick={onAddOrEditOutcome}>
              {outcome ? 'Edit outcome' : 'Add outcome'}
            </Button>
          )}
          {onEdit && (
            <Tooltip title="Edit decision">
              <IconButton size="small" aria-label="Edit decision" onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" aria-label="Delete decision" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
