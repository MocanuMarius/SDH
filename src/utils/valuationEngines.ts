/**
 * Valuation math for the "3 Engines of Value" widget.
 *
 * For each year t in the projection (0..horizon), price is:
 *
 *   price(t) = earningsFactor(t) × multipleRatio(t) × yieldFactor(t)
 *
 * where
 *   earningsFactor(t) = (1 + g)^t
 *   multipleRatio(t)  = multiple(t) / multiple(0)     ← driven by the per-year curve
 *   yieldFactor(t)    = (1 + y)^t
 *
 * The caller supplies either a linear (currentMultiple → targetMultiple)
 * pair, or an explicit per-year `multipleCurve` array of length horizon + 1.
 * The curve lets the user sketch scenarios like "multiple compresses years 2
 * and 3, rebounds only at year 5" which changes the shape of the stacked area
 * dramatically without touching growth or yield.
 *
 * Stacking (for the chart):
 *   base            = 1
 *   earningsLayer(t) = earningsFactor(t) − 1
 *   multipleLayer(t) = earningsFactor(t) × (multipleRatio(t) − 1)
 *   yieldLayer(t)    = earningsFactor(t) × multipleRatio(t) × (yieldFactor(t) − 1)
 *   total(t)         = base + earningsLayer + multipleLayer + yieldLayer
 *
 * Each layer sums to price(t) − 1 correctly at every t so the stacked area
 * matches the total price trace.
 */

export interface EngineInputs {
  earningsGrowthPct: number
  /** Optional: legacy "current multiple" — used when no multipleCurve is provided. */
  currentMultiple: number
  /** Optional: legacy "target multiple" — used when no multipleCurve is provided. */
  targetMultiple: number
  shareholderYieldPct: number
  horizonYears: number
  /**
   * Per-year multiples, length = horizonYears + 1. When present this
   * supersedes currentMultiple/targetMultiple. Position 0 is the starting
   * multiple; position horizonYears is the end-of-horizon multiple.
   */
  multipleCurve?: number[] | null
}

export interface EngineYearPoint {
  year: number
  multiple: number
  base: number
  earningsLayer: number
  /** Can be negative when the multiple contracts below baseline. */
  multipleLayer: number
  yieldLayer: number
  /** Total price at this year (base + all layers). */
  total: number
  /** Rolling CAGR from year 0 to this year. 0 at year 0. */
  rollingCagr: number
}

export interface EngineSummary {
  /** Decimal form: 0.47 = +47% total return over the horizon. */
  totalReturn: number
  /** Compound annual growth rate (decimal). */
  cagr: number
  /** Each engine's share of the total log return. Can exceed [0, 1] when engines partially cancel. */
  earningsShare: number
  multipleShare: number
  yieldShare: number
  earningsContribution: number
  multipleContribution: number
  yieldContribution: number
  /** End-of-horizon multiple in absolute terms (useful for labels). */
  endMultiple: number
  /** Start multiple (== multipleCurve[0] or currentMultiple). */
  startMultiple: number
}

const clampHorizon = (y: number): number => Math.max(1, Math.min(20, Math.round(y)))

/**
 * Build the per-year multiple array. If the caller provided a curve that matches
 * the requested horizon length, use it as-is. Otherwise interpolate linearly
 * from currentMultiple to targetMultiple.
 */
export function resolveMultipleCurve(input: EngineInputs): number[] {
  const horizon = clampHorizon(input.horizonYears)
  const len = horizon + 1
  if (Array.isArray(input.multipleCurve) && input.multipleCurve.length === len) {
    return input.multipleCurve.map((v) => Math.max(0.0001, Number(v) || 0))
  }
  const mCur = Math.max(0.0001, input.currentMultiple)
  const mTgt = Math.max(0.0001, input.targetMultiple)
  const out: number[] = []
  for (let t = 0; t < len; t++) {
    const ratio = horizon === 0 ? 1 : t / horizon
    out.push(mCur + (mTgt - mCur) * ratio)
  }
  return out
}

/**
 * Generate the year-by-year projection points for plotting.
 * Returns horizonYears + 1 points (year 0 through horizonYears inclusive).
 */
export function projectEngines(input: EngineInputs): EngineYearPoint[] {
  const horizon = clampHorizon(input.horizonYears)
  const g = input.earningsGrowthPct / 100
  const y = input.shareholderYieldPct / 100
  const curve = resolveMultipleCurve(input)
  const mStart = curve[0]

  const points: EngineYearPoint[] = []
  for (let t = 0; t <= horizon; t++) {
    const earningsFactor = Math.pow(1 + g, t)
    const multipleRatio = curve[t] / mStart
    const yieldFactor = Math.pow(1 + y, t)

    const earningsLayer = earningsFactor - 1
    const multipleLayer = earningsFactor * (multipleRatio - 1)
    const yieldLayer = earningsFactor * multipleRatio * (yieldFactor - 1)
    const total = 1 + earningsLayer + multipleLayer + yieldLayer
    const rollingCagr = t === 0 ? 0 : Math.pow(Math.max(1e-9, total), 1 / t) - 1

    points.push({
      year: t,
      multiple: curve[t],
      base: 1,
      earningsLayer,
      multipleLayer,
      yieldLayer,
      total,
      rollingCagr,
    })
  }
  return points
}

/** Compound summary of the whole horizon. */
export function summarizeEngines(input: EngineInputs): EngineSummary {
  const horizon = clampHorizon(input.horizonYears)
  const points = projectEngines(input)
  const last = points[points.length - 1]
  const totalFactor = Math.max(1e-9, last.total)
  const totalReturn = totalFactor - 1
  const cagr = Math.pow(totalFactor, 1 / horizon) - 1

  // Share decomposition in log-space so the three shares sum to 1 even when
  // engines partially cancel each other out.
  const g = input.earningsGrowthPct / 100
  const y = input.shareholderYieldPct / 100
  const curve = resolveMultipleCurve(input)
  const earningsFactor = Math.pow(1 + g, horizon)
  const multipleFactor = curve[horizon] / curve[0]
  const yieldFactor = Math.pow(1 + y, horizon)

  const logTotal = Math.log(earningsFactor * multipleFactor * yieldFactor)
  const safeLog = (v: number) => Math.log(Math.max(1e-9, v))
  const earningsShare = logTotal !== 0 ? safeLog(earningsFactor) / logTotal : 0
  const multipleShare = logTotal !== 0 ? safeLog(multipleFactor) / logTotal : 0
  const yieldShare = logTotal !== 0 ? safeLog(yieldFactor) / logTotal : 0

  return {
    totalReturn,
    cagr,
    earningsShare,
    multipleShare,
    yieldShare,
    earningsContribution: earningsShare * totalReturn,
    multipleContribution: multipleShare * totalReturn,
    yieldContribution: yieldShare * totalReturn,
    startMultiple: curve[0],
    endMultiple: curve[horizon],
  }
}

// ── Preset scenarios ───────────────────────────────────────────────────

export interface EnginePreset {
  id: string
  label: string
  emoji: string
  description: string
  inputs: EngineInputs
}

export const ENGINE_PRESETS: EnginePreset[] = [
  {
    id: 'compounder',
    label: 'Compounder',
    emoji: '🌲',
    description: 'High-quality growth, flat multiple, modest yield',
    inputs: {
      earningsGrowthPct: 15,
      currentMultiple: 25,
      targetMultiple: 25,
      shareholderYieldPct: 1,
      horizonYears: 5,
    },
  },
  {
    id: 'value_rerate',
    label: 'Value re-rate',
    emoji: '📈',
    description: 'Slow growth, big multiple expansion from depressed levels',
    inputs: {
      earningsGrowthPct: 4,
      currentMultiple: 8,
      targetMultiple: 14,
      shareholderYieldPct: 3,
      horizonYears: 5,
    },
  },
  {
    id: 'dividend',
    label: 'Dividend aristocrat',
    emoji: '💰',
    description: 'Steady low growth, stable multiple, high yield',
    inputs: {
      earningsGrowthPct: 5,
      currentMultiple: 18,
      targetMultiple: 18,
      shareholderYieldPct: 6,
      horizonYears: 10,
    },
  },
  {
    id: 'cigar_butt',
    label: 'Cigar butt',
    emoji: '🚬',
    description: 'Declining business, bet is purely on multiple pop',
    inputs: {
      earningsGrowthPct: -2,
      currentMultiple: 6,
      targetMultiple: 10,
      shareholderYieldPct: 4,
      horizonYears: 3,
    },
  },
  {
    id: 'hypergrowth',
    label: 'Hyper-growth',
    emoji: '🚀',
    description: 'Very high growth, multiple contraction as it matures',
    inputs: {
      earningsGrowthPct: 30,
      currentMultiple: 50,
      targetMultiple: 25,
      shareholderYieldPct: 0,
      horizonYears: 5,
    },
  },
  {
    id: 'buyback_machine',
    label: 'Buyback machine',
    emoji: '🔁',
    description: 'Multiple compresses early, buybacks at depressed prices pay off later',
    inputs: {
      earningsGrowthPct: 6,
      currentMultiple: 15,
      targetMultiple: 18,
      shareholderYieldPct: 7,
      horizonYears: 5,
      multipleCurve: [15, 12, 10, 10, 14, 18],
    },
  },
]
