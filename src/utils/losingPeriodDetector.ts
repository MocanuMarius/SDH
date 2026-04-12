/**
 * Losing-period detector — purely client-side.
 *
 * Given the user's closed outcomes, decides whether the Activity drawer should
 * fire a "you're in a losing streak" nudge. Two independent triggers:
 *
 *   1. **Consecutive losses**: the last N closed outcomes are all negative.
 *      Default N = 3.
 *   2. **Drawdown from peak**: the cumulative realized P&L has fallen by more
 *      than THRESHOLD_PCT from its running peak. Default threshold = 10%.
 *      The percentage is computed against the peak cumulative P&L (not the
 *      user's account size, which we don't know).
 *
 * Either trigger flips `inLosingPeriod = true`. The consuming UI can then
 * nudge the user to run a post-mortem on the most recent loser.
 *
 * The whole point of this detector is to invert the natural habit of
 * avoiding review during drawdowns. The nudge should be prominent.
 */

export interface OutcomeLite {
  action_id: string
  outcome_date: string
  realized_pnl: number | null
}

export interface LosingPeriodResult {
  inLosingPeriod: boolean
  consecutiveLosses: number
  drawdownPct: number
  peakCumulativePnl: number
  currentCumulativePnl: number
  /** action_id of the most recent loser — convenient for linking to its post-mortem. */
  mostRecentLoserActionId: string | null
  /** Date of the most recent loser. */
  mostRecentLoserDate: string | null
  /** How many closed outcomes we looked at overall. */
  sampleSize: number
  /** Which trigger fired, or null if none. */
  trigger: 'consecutive' | 'drawdown' | null
}

const DEFAULT_CONSECUTIVE_THRESHOLD = 3
const DEFAULT_DRAWDOWN_PCT = 10

export function detectLosingPeriod(
  outcomes: OutcomeLite[],
  opts?: { consecutiveThreshold?: number; drawdownPct?: number },
): LosingPeriodResult {
  const consecutiveThreshold = opts?.consecutiveThreshold ?? DEFAULT_CONSECUTIVE_THRESHOLD
  const drawdownPct = opts?.drawdownPct ?? DEFAULT_DRAWDOWN_PCT

  // Filter to resolved outcomes only (non-null P&L), sort ascending by date so
  // we can walk the cumulative series forwards.
  const resolved = outcomes
    .filter((o) => o.realized_pnl != null && Number.isFinite(o.realized_pnl))
    .map((o) => ({ ...o, realized_pnl: o.realized_pnl as number }))
    .sort((a, b) => a.outcome_date.localeCompare(b.outcome_date))

  const sampleSize = resolved.length
  if (sampleSize === 0) {
    return {
      inLosingPeriod: false,
      consecutiveLosses: 0,
      drawdownPct: 0,
      peakCumulativePnl: 0,
      currentCumulativePnl: 0,
      mostRecentLoserActionId: null,
      mostRecentLoserDate: null,
      sampleSize: 0,
      trigger: null,
    }
  }

  // Walk cumulative P&L, tracking running peak and current drawdown.
  let cumulative = 0
  let peak = 0
  for (const o of resolved) {
    cumulative += o.realized_pnl
    if (cumulative > peak) peak = cumulative
  }
  // Drawdown expressed as a percentage of the peak (if peak is positive).
  // When peak <= 0 we can't compute a meaningful %, so we fall through to the
  // consecutive-loss trigger only.
  const absDrawdown = peak - cumulative
  const drawdownAsPct = peak > 0 ? (absDrawdown / peak) * 100 : 0

  // Count consecutive losses from the tail backwards.
  let consecutiveLosses = 0
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].realized_pnl < 0) consecutiveLosses += 1
    else break
  }

  // Find the most recent loser for the "jump to post-mortem" link.
  let mostRecentLoserActionId: string | null = null
  let mostRecentLoserDate: string | null = null
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].realized_pnl < 0) {
      mostRecentLoserActionId = resolved[i].action_id
      mostRecentLoserDate = resolved[i].outcome_date
      break
    }
  }

  const consecutiveTriggered = consecutiveLosses >= consecutiveThreshold
  const drawdownTriggered = drawdownAsPct >= drawdownPct
  const inLosingPeriod = consecutiveTriggered || drawdownTriggered
  // Prefer reporting the trigger that fired first in the check order.
  const trigger: LosingPeriodResult['trigger'] = consecutiveTriggered
    ? 'consecutive'
    : drawdownTriggered
      ? 'drawdown'
      : null

  return {
    inLosingPeriod,
    consecutiveLosses,
    drawdownPct: drawdownAsPct,
    peakCumulativePnl: peak,
    currentCumulativePnl: cumulative,
    mostRecentLoserActionId,
    mostRecentLoserDate,
    sampleSize,
    trigger,
  }
}
