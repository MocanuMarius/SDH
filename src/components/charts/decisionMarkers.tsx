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

export const MARKER_BUY_COLOR = '#16a34a'   // green-600
export const MARKER_SELL_COLOR = '#dc2626'  // red-600
export const MARKER_GREYED = '#94a3b8'      // slate-400, used when ticker is filtered out

/** Default cone footprint. Override per chart if it needs a tighter glow. */
export const CONE_HEIGHT_DEFAULT = 28
export const CONE_HALFW_DEFAULT = 14

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
