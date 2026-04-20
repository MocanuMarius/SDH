/**
 * MarqueeTickerStrip — a slow horizontal ticker tape that loops
 * through the user's active watchlist with current price + delta to
 * their alert target. Evokes the ticker ribbon at the bottom of a
 * financial paper or the crawl above a TV news desk.
 *
 * Visual rules:
 *  - Monospaced numerals (theme already sets fontVariantNumeric:
 *    tabular-nums globally — we also flip to the mono font for the
 *    price itself for a typewritten look).
 *  - Serif italic for the ticker-to-target narrative ("CRC → 60.75").
 *  - Slow scroll (60s for a full loop) — reads as ambient, not
 *    urgent. Pauses on hover so the user can read a specific ticker.
 *  - Reduced-motion: the strip stays static and shows the first 4
 *    tickers as a quiet summary.
 *
 * Performance: CSS-only animation (two stacked halves shifted by
 * translateX) — no JS timer, runs on the compositor.
 */

import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { prefersReducedMotion } from '../utils/motion'

export interface TickerEntry {
  ticker: string
  alertPrice: number
  condition: string
  /** Latest known price. `null` means price-unavailable; we still
   *  render the ticker but skip the delta. */
  currentPrice: number | null
}

export interface MarqueeTickerStripProps {
  items: TickerEntry[]
}

function formatDelta(current: number, target: number): { text: string; sign: 1 | 0 | -1 } {
  const diff = current - target
  const pct = target !== 0 ? (diff / target) * 100 : 0
  const sign = pct > 0.05 ? 1 : pct < -0.05 ? -1 : 0
  const arrow = sign > 0 ? '▲' : sign < 0 ? '▼' : '·'
  return { text: `${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, sign }
}

export default function MarqueeTickerStrip({ items }: MarqueeTickerStripProps) {
  const [reduced, setReduced] = useState(false)
  useEffect(() => { setReduced(prefersReducedMotion()) }, [])
  if (!items || items.length === 0) return null

  const row = (keyPrefix: string) => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 3, px: 3 }} aria-hidden={keyPrefix === 'b'}>
      {items.map((it, i) => {
        const delta = it.currentPrice != null ? formatDelta(it.currentPrice, it.alertPrice) : null
        const deltaColor = delta?.sign === 1 ? '#16a34a' : delta?.sign === -1 ? '#dc2626' : 'text.secondary'
        return (
          <Box key={`${keyPrefix}-${it.ticker}-${i}`} sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, whiteSpace: 'nowrap' }}>
            <Typography
              component="span"
              sx={{
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'primary.dark',
                letterSpacing: '0.02em',
              }}
            >
              ${it.ticker}
            </Typography>
            {it.currentPrice != null && (
              <Typography
                component="span"
                sx={{
                  fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                  fontSize: '0.8rem',
                  color: 'text.primary',
                }}
              >
                ${it.currentPrice.toFixed(2)}
              </Typography>
            )}
            {delta && (
              <Typography
                component="span"
                sx={{
                  fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                  fontSize: '0.72rem',
                  color: deltaColor,
                  letterSpacing: '0.02em',
                }}
              >
                {delta.text}
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontStyle: 'italic',
                fontSize: '0.7rem',
                color: 'text.disabled',
                letterSpacing: '0.02em',
                ml: 0.25,
              }}
            >
              vs {it.condition} {it.alertPrice.toFixed(2)}
            </Typography>
            <Typography component="span" sx={{ color: 'text.disabled', px: 1 }}>·</Typography>
          </Box>
        )
      })}
    </Box>
  )

  if (reduced) {
    // Static summary — first few tickers, no marquee motion.
    return (
      <Box
        sx={{
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: 0.5,
          my: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {row('static')}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        borderTop: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider',
        py: 0.5,
        my: 1,
        overflow: 'hidden',
        position: 'relative',
        // Ink-like paper tint behind the strip so it reads as a separate
        // broadsheet band from the body underneath.
        bgcolor: 'grey.50',
        // Fade edges so tickers at the viewport's horizontal extremes
        // drift in/out of sight rather than hard-cut at the edge.
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 24,
          pointerEvents: 'none',
          zIndex: 1,
        },
        '&::before': { left: 0, background: 'linear-gradient(to right, var(--mui-palette-grey-50, #f4f1ea), transparent)' },
        '&::after':  { right: 0, background: 'linear-gradient(to left,  var(--mui-palette-grey-50, #f4f1ea), transparent)' },
        // Pause the marquee when the user hovers, giving them time to
        // read a specific ticker. Touch users can just stop watching.
        '&:hover .marquee-track': {
          animationPlayState: 'paused',
        },
      }}
    >
      <Box
        className="marquee-track"
        sx={{
          display: 'inline-flex',
          animation: 'marquee-scroll 60s linear infinite',
          '@keyframes marquee-scroll': {
            from: { transform: 'translateX(0)' },
            to: { transform: 'translateX(-50%)' },
          },
        }}
      >
        {row('a')}
        {row('b')}
      </Box>
    </Box>
  )
}
