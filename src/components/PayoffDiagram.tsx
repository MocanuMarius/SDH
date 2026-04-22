/**
 * PayoffDiagram — single-leg option payoff curve at expiration.
 *
 * Pure math + SVG. No external pricing data needed; this draws the
 * classic hockey-stick payoff for a single-leg long/short call or
 * put given strike, premium, contracts, and side. Optional
 * current-price marker shows where the underlying sits today
 * relative to the curve.
 *
 * Useful for:
 *  - Mid-trade glance: am I past breakeven? how much is at risk?
 *  - Post-mortem reading: visual memory of "what this position
 *    was supposed to look like".
 *  - Pre-commit sanity: did I size this correctly given max loss?
 *
 * Multi-leg structures (spreads, strangles, etc.) are not supported
 * here — every decision in the journal today is a single contract.
 *
 * Numbers convention: equity options use a 100× multiplier per
 * contract. Futures options vary by underlying — we don't try to
 * guess; the per-contract dollar values shown assume 100× and the
 * caller can override via the `multiplier` prop if needed.
 */

import { useMemo } from 'react'
import { Box, Typography } from '@mui/material'

export interface PayoffDiagramProps {
  /** Option strike price. */
  strike: number
  /** Premium paid (long) or received (short), per share. */
  premium: number
  /** Number of contracts. Defaults to 1. */
  contracts?: number
  /** 'C' = call, 'P' = put. */
  right: 'C' | 'P'
  /** 'long' = bought the option (paid premium); 'short' = wrote
   *  the option (received premium). Derived from action.type by
   *  the caller (buy/add_more → long, sell/short → short). */
  side: 'long' | 'short'
  /** Optional: current underlying price, drawn as a vertical
   *  reference line so the reader sees where the trade stands. */
  currentPrice?: number | null
  /** Contract multiplier — equity options = 100, futures vary.
   *  Used only for the "Max loss / Max gain" dollar labels. */
  multiplier?: number
  /** Optional: fixed width override. Default: stretches to parent. */
  width?: number
  /** Optional: fixed height override. */
  height?: number
}

const GAIN_COLOR = '#15803d'  // green-700
const LOSS_COLOR = '#b91c1c'  // red-700
const STRIKE_COLOR = '#1e3a8a' // primary-dark
const NOW_COLOR = '#7c3aed'    // secondary
const AXIS_COLOR = 'rgba(15, 23, 42, 0.18)'
const ZERO_COLOR = 'rgba(15, 23, 42, 0.32)'

/** Per-share P&L at expiration for a single-leg position. */
function payoffAtExpiry(S: number, K: number, premium: number, right: 'C' | 'P', side: 'long' | 'short'): number {
  const intrinsic = right === 'C' ? Math.max(0, S - K) : Math.max(0, K - S)
  const longPnl = intrinsic - premium
  return side === 'long' ? longPnl : -longPnl
}

/** Format dollar number compactly: $1,234 / $1.2K / -$420. */
function fmt$(n: number): string {
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 10_000) return `${sign}$${(a / 1000).toFixed(a >= 100_000 ? 0 : 1)}K`
  return `${sign}$${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function PayoffDiagram({
  strike,
  premium,
  contracts = 1,
  right,
  side,
  currentPrice,
  multiplier = 100,
  width,
  height,
}: PayoffDiagramProps) {
  // Pre-compute everything inside one memo so the component re-
  // renders cheaply when only the parent re-renders.
  const model = useMemo(() => {
    if (!Number.isFinite(strike) || strike <= 0) return null
    if (!Number.isFinite(premium) || premium < 0) return null

    // Breakeven (per share):
    //   long call:  strike + premium
    //   long put:   strike - premium
    //   short call: strike + premium  (above this, the writer loses)
    //   short put:  strike - premium  (below this, the writer loses)
    const breakeven = right === 'C' ? strike + premium : strike - premium

    // Choose an X-axis range that frames strike, breakeven, and
    // current price comfortably. Default: [0.6 × min, 1.6 × max] of
    // the relevant prices, snapped to a sensible window around strike.
    const refs = [strike, breakeven]
    if (currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0) refs.push(currentPrice)
    const lo = Math.max(0, Math.min(...refs) * 0.55)
    const hi = Math.max(...refs) * 1.55

    // Sample the payoff at 80 points across the range. The function
    // is piecewise linear so two segments would suffice for the line
    // itself, but a denser sample makes the gain/loss fill simpler
    // (no manual segment math).
    const N = 80
    const xs = Array.from({ length: N + 1 }, (_, i) => lo + (i / N) * (hi - lo))
    const yPerShare = xs.map((x) => payoffAtExpiry(x, strike, premium, right, side))
    const yPerPosition = yPerShare.map((y) => y * contracts * multiplier)

    const maxGain = Math.max(...yPerPosition)
    const minLoss = Math.min(...yPerPosition)

    // Label "max" / "min" — for the unbounded directions, show "∞".
    const isLongCall = side === 'long' && right === 'C'
    const isShortCall = side === 'short' && right === 'C'
    const maxGainLabel = isLongCall ? '∞ (unbounded)' : fmt$(maxGain)
    const maxLossLabel = isShortCall ? '-∞ (unbounded)' : fmt$(minLoss)

    return {
      xs,
      yPerPosition,
      lo,
      hi,
      yMin: minLoss * 1.1,
      yMax: maxGain * 1.1,
      breakeven,
      maxGainLabel,
      maxLossLabel,
    }
  }, [strike, premium, contracts, right, side, currentPrice, multiplier])

  if (!model) return null

  const W = width ?? 320
  const H = height ?? 140
  const pad = { top: 14, right: 8, bottom: 22, left: 32 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  // Project a (price, pnl) point into SVG coordinates.
  const xToPx = (x: number) => pad.left + ((x - model.lo) / (model.hi - model.lo)) * innerW
  const yRange = model.yMax - model.yMin || 1
  const yToPx = (y: number) => pad.top + (1 - (y - model.yMin) / yRange) * innerH

  // Path for the payoff line itself.
  const linePath = model.xs
    .map((x, i) => {
      const cmd = i === 0 ? 'M' : 'L'
      return `${cmd} ${xToPx(x).toFixed(1)} ${yToPx(model.yPerPosition[i]).toFixed(1)}`
    })
    .join(' ')

  // Filled area between the curve and the zero line, split into
  // gain (above zero, green) and loss (below zero, red) regions.
  const zeroY = yToPx(0)
  const gainArea = (() => {
    let path = ''
    let inGain = false
    let segStartX = 0
    for (let i = 0; i < model.xs.length; i++) {
      const px = xToPx(model.xs[i])
      const py = yToPx(model.yPerPosition[i])
      const above = model.yPerPosition[i] > 0
      if (above && !inGain) {
        segStartX = px
        path += `M ${px.toFixed(1)} ${zeroY.toFixed(1)} L ${px.toFixed(1)} ${py.toFixed(1)} `
        inGain = true
      } else if (above && inGain) {
        path += `L ${px.toFixed(1)} ${py.toFixed(1)} `
      } else if (!above && inGain) {
        path += `L ${px.toFixed(1)} ${zeroY.toFixed(1)} L ${segStartX.toFixed(1)} ${zeroY.toFixed(1)} Z `
        inGain = false
      }
    }
    if (inGain) {
      const lastPx = xToPx(model.xs[model.xs.length - 1])
      path += `L ${lastPx.toFixed(1)} ${zeroY.toFixed(1)} L ${segStartX.toFixed(1)} ${zeroY.toFixed(1)} Z`
    }
    return path
  })()
  const lossArea = (() => {
    let path = ''
    let inLoss = false
    let segStartX = 0
    for (let i = 0; i < model.xs.length; i++) {
      const px = xToPx(model.xs[i])
      const py = yToPx(model.yPerPosition[i])
      const below = model.yPerPosition[i] < 0
      if (below && !inLoss) {
        segStartX = px
        path += `M ${px.toFixed(1)} ${zeroY.toFixed(1)} L ${px.toFixed(1)} ${py.toFixed(1)} `
        inLoss = true
      } else if (below && inLoss) {
        path += `L ${px.toFixed(1)} ${py.toFixed(1)} `
      } else if (!below && inLoss) {
        path += `L ${px.toFixed(1)} ${zeroY.toFixed(1)} L ${segStartX.toFixed(1)} ${zeroY.toFixed(1)} Z `
        inLoss = false
      }
    }
    if (inLoss) {
      const lastPx = xToPx(model.xs[model.xs.length - 1])
      path += `L ${lastPx.toFixed(1)} ${zeroY.toFixed(1)} L ${segStartX.toFixed(1)} ${zeroY.toFixed(1)} Z`
    }
    return path
  })()

  // Markers: strike (always), breakeven (always), current (optional).
  const strikePx = xToPx(strike)
  const breakevenPx = xToPx(model.breakeven)
  const currentPx = currentPrice != null && currentPrice >= model.lo && currentPrice <= model.hi
    ? xToPx(currentPrice)
    : null

  return (
    <Box sx={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        style={{ display: 'block', maxHeight: H }}
        aria-label={`Payoff diagram: ${side} ${right === 'C' ? 'call' : 'put'} at strike ${strike}`}
      >
        {/* Filled gain / loss regions */}
        <path d={lossArea} fill={LOSS_COLOR} fillOpacity={0.12} />
        <path d={gainArea} fill={GAIN_COLOR} fillOpacity={0.14} />

        {/* Zero-P&L line */}
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke={ZERO_COLOR} strokeWidth={1} strokeDasharray="2 3" />

        {/* Y-axis tick at zero */}
        <text x={pad.left - 4} y={zeroY + 3} fontSize={9} textAnchor="end" fill="rgba(15, 23, 42, 0.6)">
          $0
        </text>

        {/* X-axis baseline */}
        <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke={AXIS_COLOR} strokeWidth={1} />

        {/* Strike vertical */}
        <line x1={strikePx} y1={pad.top} x2={strikePx} y2={H - pad.bottom} stroke={STRIKE_COLOR} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" />
        <text x={strikePx} y={H - pad.bottom + 12} fontSize={9} textAnchor="middle" fill={STRIKE_COLOR}>
          K ${strike}
        </text>

        {/* Breakeven vertical */}
        {Math.abs(model.breakeven - strike) > 0.01 && (
          <>
            <line x1={breakevenPx} y1={pad.top} x2={breakevenPx} y2={H - pad.bottom} stroke="rgba(15, 23, 42, 0.35)" strokeWidth={1} strokeDasharray="2 4" />
            <text x={breakevenPx} y={pad.top + 9} fontSize={8.5} textAnchor="middle" fill="rgba(15, 23, 42, 0.55)">
              BE ${model.breakeven.toFixed(2)}
            </text>
          </>
        )}

        {/* Current-price vertical */}
        {currentPx != null && (
          <>
            <line x1={currentPx} y1={pad.top} x2={currentPx} y2={H - pad.bottom} stroke={NOW_COLOR} strokeWidth={1.25} />
            <text x={currentPx} y={H - pad.bottom + 12} fontSize={9} textAnchor="middle" fill={NOW_COLOR} fontWeight={700}>
              now
            </text>
          </>
        )}

        {/* Payoff curve */}
        <path d={linePath} fill="none" stroke="rgba(15, 23, 42, 0.85)" strokeWidth={1.75} strokeLinejoin="round" />
      </svg>

      {/* Compact legend / extremes */}
      <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ color: GAIN_COLOR, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.68rem' }}>
          Max gain: {model.maxGainLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', fontSize: '0.68rem' }}>
          at expiry · {contracts}× contract{contracts === 1 ? '' : 's'} × {multiplier}
        </Typography>
        <Typography variant="caption" sx={{ color: LOSS_COLOR, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.68rem' }}>
          Max loss: {model.maxLossLabel}
        </Typography>
      </Box>
    </Box>
  )
}
