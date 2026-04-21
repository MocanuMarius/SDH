/**
 * GutterAnnotation — the margin-note block shown in the right
 * gutter next to the paragraph where a $TICKER is first mentioned
 * in an entry's body. Tufte-sidenote feel, investment-journal
 * content: shows how the ticker has moved since the entry was
 * written.
 *
 * Rendering:
 *   $TICKER                  (small-caps tabular, primary-dark)
 *   +4.2%                    (chunky, coloured by sign)
 *   now  $184.12             (muted mono price)
 *   ─── since entry          (italic divider label)
 *
 * The block is intentionally narrow (≤ 140 px) — gutter, not
 * column — and is styled so that even with no data (API failure,
 * symbol not covered) it degrades gracefully to a muted "—" with
 * the ticker label still visible, so the writer sees what the
 * reference WOULD have pointed to.
 *
 * Coloring uses explicit hex values rather than theme accents so
 * the gain/loss read is unmistakable regardless of palette tweaks.
 */

import { Box, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { TickerDelta } from '../hooks/useBodyTickerDeltas'
import { normalizeTickerToCompany, getTickerDisplayLabel } from '../utils/tickerCompany'

export interface GutterAnnotationProps {
  ticker: string
  delta: TickerDelta | undefined
}

const GAIN = '#15803d'   // green-700
const LOSS = '#b91c1c'   // red-700
const NEUTRAL = '#64748b' // slate-500

export default function GutterAnnotation({ ticker, delta }: GutterAnnotationProps) {
  const pct = delta?.pct ?? null
  const currentPrice = delta?.currentPrice ?? null
  const sign: 'up' | 'down' | 'flat' | null =
    pct == null ? null : pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'
  const accent = sign === 'up' ? GAIN : sign === 'down' ? LOSS : NEUTRAL

  const tickerLabel = getTickerDisplayLabel(ticker) || ticker.toUpperCase()
  const companyKey = normalizeTickerToCompany(ticker) || ticker.toUpperCase()

  return (
    <Box
      component={RouterLink}
      to={`/tickers/${encodeURIComponent(companyKey)}`}
      aria-label={`${ticker} — ${pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% since entry` : 'no price data'}`}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        borderLeft: '2px solid',
        borderLeftColor: accent,
        pl: 1,
        py: 0.25,
        transition: 'background-color 140ms ease, border-left-color 140ms ease',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Typography
        sx={{
          fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'text.primary',
          lineHeight: 1.2,
        }}
      >
        {tickerLabel}
      </Typography>
      {pct != null ? (
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.95rem',
            fontWeight: 700,
            color: accent,
            lineHeight: 1.1,
            mt: 0.25,
          }}
        >
          {pct >= 0 ? '+' : ''}
          {pct.toFixed(1)}%
        </Typography>
      ) : (
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.95rem',
            fontWeight: 700,
            color: 'text.disabled',
            lineHeight: 1.1,
            mt: 0.25,
          }}
        >
          —
        </Typography>
      )}
      {currentPrice != null && (
        <Typography
          sx={{
            fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.66rem',
            color: 'text.disabled',
            lineHeight: 1.3,
            mt: 0.25,
          }}
        >
          now ${currentPrice.toFixed(2)}
        </Typography>
      )}
      <Typography
        sx={{
          fontStyle: 'italic',
          fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
          fontSize: '0.66rem',
          color: 'text.disabled',
          lineHeight: 1.3,
          mt: 0.25,
          letterSpacing: '0.02em',
        }}
      >
        since entry
      </Typography>
    </Box>
  )
}
