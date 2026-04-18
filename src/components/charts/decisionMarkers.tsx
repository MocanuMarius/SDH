/**
 * Shared SVG primitives for the dot + cone decision marker — used by every
 * chart in the app (Timeline, per-ticker, ticker popup) so they render with
 * the same shape language without each file reinventing it.
 *
 * Usage inside any <svg>:
 *
 *     // Once per chart:
 *     <DecisionMarkerGradients idPrefix="my-chart" />
 *
 *     // Per marker — cone first (so the dot stacks on top), wrapped in the
 *     // multiply-blend group below so overlapping cones darken/saturate:
 *     <g style={{ mixBlendMode: 'multiply' }}>
 *       <path d={conePath(cx, cy, 'buy')} fill={`url(#my-chart-buy-glow)`} />
 *     </g>
 *     <circle cx={cx} cy={cy} r={4} fill={MARKER_BUY_COLOR} stroke="#fff" strokeWidth={1} />
 */

// Sourced from `theme.tokens` so the chart-marker palette stays in sync
// with the rest of the app. Re-exported as named constants so legacy
// import sites keep working — but new code should prefer `tokens.marker*`
// or `useTheme().palette.marker.*` directly.
import { tokens } from '../../theme'

export const MARKER_BUY_COLOR = tokens.markerBuy
export const MARKER_SELL_COLOR = tokens.markerSell
export const MARKER_GREYED = tokens.markerGreyed

/** Default cone footprint. Override per chart if it needs a tighter glow. */
export const CONE_HEIGHT_DEFAULT = 28
export const CONE_HALFW_DEFAULT = 14

// ── Marker geometry (was inline in TimelineChartVisx) ─────────────────────
// Keeping it here means the per-ticker page or popup can adopt the same
// dot-radius / cone-size scale if they ever need to without re-deriving
// the breakpoints. Today TimelineChartVisx is the only consumer.

import type { ActionSize } from '../../types/database'

export interface MarkerGeom {
  /** Single-marker dot radius in px. */
  DOT_R: number
  DOT_STROKE: number
  /** Maximum cone footprint — used for clustering & hit-testing. */
  CONE_HEIGHT_MAX: number
  CONE_HALFWIDTH_MAX: number
  /** Per-size cone height in px. Half-width = height * 0.5. */
  CONE_SIZE: Record<ActionSize, number>
}

/**
 * Per-breakpoint marker sizing. Mobile gets slightly smaller dots and
 * cones because the chart itself is narrower; desktop gets the full
 * scale. Cone heights are in px and grow with trade size (tiny → xl).
 */
export function getMarkerGeom(width: number): MarkerGeom {
  const mobile = width < 480
  const sizes: Record<ActionSize, number> = mobile
    ? { tiny: 10, small: 18, medium: 28, large: 42, xl: 60 }
    : { tiny: 12, small: 22, medium: 34, large: 52, xl: 72 }
  const maxH = sizes.xl
  return {
    DOT_R: mobile ? 3.5 : 4,
    DOT_STROKE: 1,
    CONE_HEIGHT_MAX: maxH,
    CONE_HALFWIDTH_MAX: Math.round(maxH * 0.5),
    CONE_SIZE: sizes,
  }
}

/**
 * Radius for a cluster dot whose `count` markers have collapsed into a
 * single dot. Scales with sqrt(count) so the dot's *area* grows linearly
 * with count (visually accurate weighting), capped at 4× base so even
 * huge clusters stay tappable without dominating the chart. Hover adds
 * 1.5px so the dot pops on cursor enter.
 */
export function clusterDotRadius(count: number, baseR: number, hovered: boolean): number {
  const base = baseR * Math.sqrt(Math.max(1, count))
  const capped = Math.min(baseR * 4, base)
  return hovered ? capped + 1.5 : capped
}

/**
 * Triangle path with apex at the dot, base `height` px away in `dir`. Half-width
 * defaults to `height / 2` for a clean ~45° cone at any size.
 *
 * dir = 'buy' → cone goes UP (lower y values on screen).
 * dir = 'sell' → cone goes DOWN.
 */
export function conePath(
  cx: number,
  cy: number,
  dir: 'buy' | 'sell',
  height: number = CONE_HEIGHT_DEFAULT,
  halfW: number = CONE_HALFW_DEFAULT,
): string {
  const baseY = dir === 'buy' ? cy - height : cy + height
  return `M ${cx} ${cy} L ${cx + halfW} ${baseY} L ${cx - halfW} ${baseY} Z`
}

/**
 * Solid coloured dot on the price line. When the marker carries BOTH buy
 * and sell decisions on the same point, renders a split dot (green top
 * semicircle, red bottom). Otherwise a single circle.
 *
 * Both directional charts (TimelineChartVisx, TickerTimelineChart) used
 * to inline this SVG dance — now there's one source of truth.
 *
 * Pass `count > 1` to overlay the count number inside the dot. Pass
 * `greyed` to render with the muted ARROW_GREYED colour (e.g. when a
 * ticker filter excludes this marker).
 */
export function DecisionDot({
  cx,
  cy,
  r = 5,
  hasBuy,
  hasSell,
  count = 0,
  greyed = false,
  buyColor = MARKER_BUY_COLOR,
  sellColor = MARKER_SELL_COLOR,
  otherColor = '#475569',
  stroke = '#fff',
  strokeWidth = 1,
}: {
  cx: number
  cy: number
  r?: number
  hasBuy: boolean
  hasSell: boolean
  count?: number
  greyed?: boolean
  buyColor?: string
  sellColor?: string
  otherColor?: string
  stroke?: string
  strokeWidth?: number
}) {
  const isMixed = hasBuy && hasSell
  const solidFill = greyed
    ? MARKER_GREYED
    : hasBuy ? buyColor
    : hasSell ? sellColor
    : otherColor
  return (
    <g>
      {isMixed ? (
        <g>
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={greyed ? MARKER_GREYED : buyColor} />
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`} fill={greyed ? MARKER_GREYED : sellColor} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={r} fill={solidFill} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {count > 1 && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={9}
          fontWeight={600}
          pointerEvents="none"
        >
          {count}
        </text>
      )}
    </g>
  )
}

/**
 * Bucket decisions on a marker into buy / sell / other counts. Every chart
 * does this same reduction to decide which cone(s) to draw and how to
 * colour the dot — single helper so the categorisation can't drift.
 *
 * `'buy'` and `'sell'` here are the **chart category** (already collapsed
 * from the action's true type via `getChartCategory()`), not the raw
 * action.type. `add_more` lands in `buy`, `trim` in `sell`, etc.
 */
export function decisionCountsByType(
  decisions: Array<{ type: 'buy' | 'sell' | 'other' }> | undefined,
): { buy: number; sell: number; other: number } {
  const counts = { buy: 0, sell: 0, other: 0 }
  if (!decisions?.length) return counts
  for (const d of decisions) {
    if (d.type === 'buy') counts.buy++
    else if (d.type === 'sell') counts.sell++
    else counts.other++
  }
  return counts
}

/**
 * The two `<linearGradient>` defs that paint the cone. Each chart needs to
 * mount this once (inside its own `<svg><defs>`) and reference the gradients
 * by `url(#${idPrefix}-buy-glow)` / `url(#${idPrefix}-sell-glow)`.
 *
 * Three stops produce the dense-near-dot, fade-at-tip look (a two-stop
 * linear gradient looked too uniform).
 */
export function DecisionMarkerGradients({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      {/* y1=1 means "start at the bottom of the bbox" — for buy cones whose
          apex (= dot) is at the bottom of the path bbox. */}
      <linearGradient id={`${idPrefix}-buy-glow`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={MARKER_BUY_COLOR} stopOpacity="0.85" />
        <stop offset="0.35" stopColor={MARKER_BUY_COLOR} stopOpacity="0.55" />
        <stop offset="1" stopColor={MARKER_BUY_COLOR} stopOpacity="0" />
      </linearGradient>
      {/* Mirrored: sell cone apex is at the TOP of its path bbox. */}
      <linearGradient id={`${idPrefix}-sell-glow`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={MARKER_SELL_COLOR} stopOpacity="0.85" />
        <stop offset="0.35" stopColor={MARKER_SELL_COLOR} stopOpacity="0.55" />
        <stop offset="1" stopColor={MARKER_SELL_COLOR} stopOpacity="0" />
      </linearGradient>
    </>
  )
}
