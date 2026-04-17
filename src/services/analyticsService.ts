/**
 * Analytics Service: Aggregates trading outcomes, calculates performance metrics,
 * and provides insights into trading patterns, decision quality, and error analysis.
 */

import { listOutcomes } from './outcomesService'
import { listActions } from './actionsService'
import { listEntries } from './entriesService'
import { fetchWeeklySentimentBands } from './sentimentService'
import { normalizeTicker } from '../utils/tickerNormalization'
import { parseOptionSymbol } from '../utils/optionSymbol'
import { isAutomatedEntry } from '../utils/entryTitle'

import type {
  OutcomeAnalytics,
  MetricsSnapshot,
  PerformanceByTicker,
  PerformanceByActionType,
  PerformanceByMarketFeeling,
  SkillVsLuckCondition,
  ErrorFrequency,
  ProcessOutcomeQuadrant,
  ReturnBin,
  HoldingPeriodBin,
  AnalyticsFilter,
  AnalyticsSnapshot,
} from '../types/analytics'
import type { Action, ActionType, ErrorType } from '../types/database'

// Re-export types for convenience
export type {
  OutcomeAnalytics,
  MetricsSnapshot,
  PerformanceByTicker,
  PerformanceByActionType,
  PerformanceByMarketFeeling,
  SkillVsLuckCondition,
  ErrorFrequency,
  ProcessOutcomeQuadrant,
  ReturnBin,
  HoldingPeriodBin,
  AnalyticsFilter,
  AnalyticsSnapshot,
}

/**
 * Fetch all outcomes with full context (actions, entries, market data)
 * Calculates return %, holding days, and enriches with market context
 */
export async function fetchOutcomesWithContext(): Promise<OutcomeAnalytics[]> {
  const [outcomes, actions, entries] = await Promise.all([
    listOutcomes(),
    listActions(),
    listEntries(),
  ])

  // Build lookup maps
  const actionMap = new Map(actions.map((a: Action) => [a.id, a]))
  const entryMap = new Map(entries.map((e) => [e.id, e]))

  // Fetch sentiment bands for context
  const sentimentBands = await fetchWeeklySentimentBands('2020-01-01', new Date().toISOString().split('T')[0])

  // Transform outcomes to analytics format
  const analytics: OutcomeAnalytics[] = []

  for (const outcome of outcomes) {
    const action = actionMap.get(outcome.action_id)
    const entry = action && action.entry_id ? entryMap.get(action.entry_id) : null

    if (!action || !entry) continue

    // Never include automated IBKR entries in analytics. Those exist for raw
    // data preservation but should not pollute metrics, charts, or Brier scores.
    // Only real Journalytic decisions count.
    if (isAutomatedEntry(entry)) continue

    // Exclude option trades from stats. IBKR-imported option rows report
    // absurd % returns (e.g. 500,000% on a $0.10 premium) and the user
    // treats them as noise — analytics should be about the underlying
    // investment theses, not the option book.
    if (parseOptionSymbol(action.ticker) != null) continue

    const decisionDate = new Date(action.action_date)
    const outcomeDate = new Date(outcome.outcome_date)
    const holdingDays = Math.floor((outcomeDate.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24))

    const decisionPrice = parsePrice(action.price)
    const hasFullData = decisionPrice > 0 && action.shares != null && action.shares > 0

    // All surviving rows are non-option equities; no contract multiplier needed.
    const optionMultiplier = 1

    // Return calculation:
    // - If we have price + shares: use realized_pnl / (shares * price * multiplier)
    // - If we only have realized_pnl (IBKR-seeded without cost basis): returnPercent stays null
    const returnPercent = hasFullData && outcome.realized_pnl != null
      ? Math.max(-100, (outcome.realized_pnl / (action.shares! * decisionPrice * optionMultiplier)) * 100)
      : null

    // finalPrice is a pseudo "exit equity price" derived from realised P&L
    // per share. Options were filtered out above, so we only need the
    // equity branch here.
    const finalPrice = hasFullData && outcome.realized_pnl != null
      ? decisionPrice + outcome.realized_pnl / action.shares!
      : decisionPrice

    // Get sentiment for the decision date
    const sentimentForDate = sentimentBands.find(
      (band) => action.action_date >= band.weekStart && action.action_date <= band.weekEnd
    )

    // Parse market conditions from entry
    const marketConditions: string[] = entry.market_context
      ? entry.market_context.split(',').map((c) => c.trim()).filter(Boolean)
      : []

    analytics.push({
      actionId: action.id,
      entryId: entry.id,
      ticker: normalizeTicker(action.ticker),
      type: action.type,
      decisionDate: action.action_date,
      decisionPrice,
      shares: action.shares,
      outcomeDate: outcome.outcome_date,
      finalPrice,
      realizedPnl: outcome.realized_pnl || 0,
      returnPercent,
      holdingDays,
      processQuality: outcome.process_quality || null,
      outcomeQuality: outcome.outcome_quality || null,
      processScore: outcome.process_score ?? null,
      outcomeScore: outcome.outcome_score ?? null,
      driver: outcome.driver || null,
      errorTypes: outcome.error_type || [],
      marketConditions,
      marketFeeling: entry.market_feeling || null,
      sentiment: sentimentForDate?.sentiment || null,
    })
  }

  return analytics
}

/**
 * Apply filters to analytics data
 */
function applyFilter(analytics: OutcomeAnalytics[], filter: AnalyticsFilter): OutcomeAnalytics[] {
  return analytics.filter((item: OutcomeAnalytics) => {
    if (filter.startDate && item.decisionDate < filter.startDate) return false
    if (filter.endDate && item.decisionDate > filter.endDate) return false
    if (filter.tickers && filter.tickers.length > 0 && !filter.tickers.includes(item.ticker)) return false
    if (filter.actionTypes && filter.actionTypes.length > 0 && !filter.actionTypes.includes(item.type)) return false
    if (filter.marketConditions && filter.marketConditions.length > 0) {
      const hasCondition = filter.marketConditions.some((cond: string) => item.marketConditions.includes(cond))
      if (!hasCondition) return false
    }
    if (filter.sentimentRange && item.sentiment !== null) {
      const [min, max] = filter.sentimentRange
      if (item.sentiment < min || item.sentiment > max) return false
    }
    if (filter.processQuality && item.processQuality !== filter.processQuality) return false
    return true
  })
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

export function calculateWinRate(outcomes: OutcomeAnalytics[]): number {
  if (outcomes.length === 0) return 0
  const wins = outcomes.filter((o) => o.realizedPnl > 0).length
  return (wins / outcomes.length) * 100
}

export function calculateAverageReturn(outcomes: OutcomeAnalytics[]): number {
  const withReturn = outcomes.filter((o) => o.returnPercent != null)
  if (withReturn.length === 0) return 0
  const sum = withReturn.reduce((acc, o) => acc + o.returnPercent!, 0)
  return sum / withReturn.length
}

export function calculateMedianReturn(outcomes: OutcomeAnalytics[]): number {
  const withReturn = outcomes.filter((o) => o.returnPercent != null)
  if (withReturn.length === 0) return 0
  const sorted = [...withReturn].sort((a, b) => a.returnPercent! - b.returnPercent!)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1].returnPercent! + sorted[mid].returnPercent!) / 2 : sorted[mid].returnPercent!
}

export function calculateCAGR(outcomes: OutcomeAnalytics[], startDate?: string, endDate?: string): number {
  if (outcomes.length === 0) return 0

  // Only use outcomes that have full cost basis data for CAGR calculation
  const withCapital = outcomes.filter((o) => o.shares != null && o.shares > 0 && o.decisionPrice > 0)
  if (withCapital.length === 0) return 0

  const start = startDate
    ? new Date(startDate)
    : new Date(Math.min(...withCapital.map((o) => new Date(o.decisionDate).getTime())))
  const end = endDate
    ? new Date(endDate)
    : new Date(Math.max(...withCapital.map((o) => new Date(o.outcomeDate).getTime())))

  const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  if (years <= 0) return 0

  const totalReturn = withCapital.reduce((acc, o) => acc + o.realizedPnl, 0)
  const startCapital = withCapital.reduce((acc, o) => acc + o.shares! * o.decisionPrice, 0)

  if (startCapital === 0) return 0

  const endValue = startCapital + totalReturn
  const cagr = (Math.pow(endValue / startCapital, 1 / years) - 1) * 100

  return isFinite(cagr) ? cagr : 0
}

export function calculatePayoffRatio(outcomes: OutcomeAnalytics[]): number {
  if (outcomes.length === 0) return 0

  const wins = outcomes.filter((o) => o.realizedPnl > 0)
  const losses = outcomes.filter((o) => o.realizedPnl < 0)

  if (wins.length === 0 || losses.length === 0) return 0

  const avgWin = wins.reduce((acc, o) => acc + o.realizedPnl, 0) / wins.length
  const avgLoss = Math.abs(losses.reduce((acc, o) => acc + o.realizedPnl, 0) / losses.length)

  return avgLoss > 0 ? avgWin / avgLoss : 0
}

export function calculateSharpeRatio(outcomes: OutcomeAnalytics[], riskFreeRate: number = 0.04): number {
  const withReturn = outcomes.filter((o) => o.returnPercent != null)
  if (withReturn.length < 2) return 0

  const returns = withReturn.map((o) => o.returnPercent! / 100)
  const avgReturn = returns.reduce((a, b) => a + b) / returns.length
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0
  return ((avgReturn - riskFreeRate / 252) / stdDev) * Math.sqrt(252) // annualized
}

export function calculateMaxDrawdown(outcomes: OutcomeAnalytics[]): number {
  if (outcomes.length === 0) return 0

  const sortedByDate = [...outcomes].sort((a, b) => new Date(a.decisionDate).getTime() - new Date(b.decisionDate).getTime())

  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0

  for (const outcome of sortedByDate) {
    cumulative += outcome.realizedPnl
    if (cumulative > peak) {
      peak = cumulative
    }
    const drawdown = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return maxDrawdown
}

export function groupOutcomesByTicker(outcomes: OutcomeAnalytics[]): PerformanceByTicker[] {
  const grouped = new Map<string, OutcomeAnalytics[]>()

  outcomes.forEach((o: OutcomeAnalytics) => {
    if (!grouped.has(o.ticker)) {
      grouped.set(o.ticker, [])
    }
    grouped.get(o.ticker)!.push(o)
  })

  return Array.from(grouped.entries())
    .map(([ticker, items]: [string, OutcomeAnalytics[]]) => {
      const withReturn = items.filter((o) => o.returnPercent != null)
      const best = withReturn.length > 0 ? withReturn.reduce((b, o) => (o.returnPercent! > b.returnPercent! ? o : b)) : null
      const worst = withReturn.length > 0 ? withReturn.reduce((w, o) => (o.returnPercent! < w.returnPercent! ? o : w)) : null
      return {
        ticker,
        trades: items.length,
        winRate: calculateWinRate(items),
        avgReturn: calculateAverageReturn(items),
        medianReturn: calculateMedianReturn(items),
        cagr: calculateCAGR(items),
        totalPnl: items.reduce((acc, o) => acc + o.realizedPnl, 0),
        bestTrade: {
          date: best ? best.decisionDate : '',
          returnPercent: best ? best.returnPercent! : 0,
        },
        worstTrade: {
          date: worst ? worst.decisionDate : '',
          returnPercent: worst ? worst.returnPercent! : 0,
        },
      }
    })
    .sort((a, b) => b.trades - a.trades)
}

export function groupOutcomesByType(outcomes: OutcomeAnalytics[]): PerformanceByActionType[] {
  const grouped = new Map<string, OutcomeAnalytics[]>()

  outcomes.forEach((o) => {
    if (!grouped.has(o.type)) {
      grouped.set(o.type, [])
    }
    grouped.get(o.type)!.push(o)
  })

  return Array.from(grouped.entries())
    .map(([type, items]) => ({
      type: type as ActionType,
      trades: items.length,
      winRate: calculateWinRate(items),
      avgReturn: calculateAverageReturn(items),
      medianReturn: calculateMedianReturn(items),
      totalPnl: items.reduce((acc, o) => acc + o.realizedPnl, 0),
    }))
    .sort((a, b) => b.trades - a.trades)
}

export function groupOutcomesByMarketFeeling(outcomes: OutcomeAnalytics[]): PerformanceByMarketFeeling[] {
  // Filter outcomes that have market feeling data (-10 to +10 scale)
  const withFeeling = outcomes.filter((o) => o.marketFeeling !== null)

  const bins = [
    { feelingBin: '-10 to -4 (Fear)', minFeeling: -10, maxFeeling: -4 },
    { feelingBin: '-3 to +3 (Neutral)', minFeeling: -3, maxFeeling: 3 },
    { feelingBin: '+4 to +10 (Greed)', minFeeling: 4, maxFeeling: 10 },
  ]

  return bins.map((bin) => {
    const items = withFeeling.filter((o) => o.marketFeeling! >= bin.minFeeling && o.marketFeeling! <= bin.maxFeeling)
    return {
      feelingBin: bin.feelingBin,
      minFeeling: bin.minFeeling,
      maxFeeling: bin.maxFeeling,
      trades: items.length,
      winRate: calculateWinRate(items),
      avgReturn: calculateAverageReturn(items),
      medianReturn: calculateMedianReturn(items),
      totalPnl: items.reduce((acc, o) => acc + o.realizedPnl, 0),
    }
  })
}

export function calculateStdDev(outcomes: OutcomeAnalytics[]): number {
  const withReturn = outcomes.filter((o) => o.returnPercent != null)
  if (withReturn.length < 2) return 0
  const returns = withReturn.map((o) => o.returnPercent!)
  const avg = returns.reduce((a, b) => a + b) / returns.length
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / returns.length
  return Math.sqrt(variance)
}

export function analyzeSkillVsLuck(outcomes: OutcomeAnalytics[]): SkillVsLuckCondition[] {
  // Extract unique market conditions from outcomes
  const conditionMap = new Map<string, OutcomeAnalytics[]>()

  outcomes.forEach((o) => {
    if (o.marketConditions && o.marketConditions.length > 0) {
      o.marketConditions.forEach((condition) => {
        if (!conditionMap.has(condition)) {
          conditionMap.set(condition, [])
        }
        conditionMap.get(condition)!.push(o)
      })
    }
  })

  // If no market conditions are set, analyze by market feeling as a proxy (-10 to +10 scale)
  if (conditionMap.size === 0) {
    const fearItems = outcomes.filter((o) => o.marketFeeling != null && o.marketFeeling >= -10 && o.marketFeeling <= -4)
    const neutralItems = outcomes.filter((o) => o.marketFeeling != null && o.marketFeeling >= -3 && o.marketFeeling <= 3)
    const greedItems = outcomes.filter((o) => o.marketFeeling != null && o.marketFeeling >= 4 && o.marketFeeling <= 10)

    return [
      createSkillVsLuckCondition('Fear Markets (-10 to -4)', fearItems),
      createSkillVsLuckCondition('Neutral Markets (-3 to +3)', neutralItems),
      createSkillVsLuckCondition('Greed Markets (+4 to +10)', greedItems),
    ]
  }

  return Array.from(conditionMap.entries())
    .map(([condition, items]) => createSkillVsLuckCondition(condition, items))
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
}

function createSkillVsLuckCondition(condition: string, items: OutcomeAnalytics[]): SkillVsLuckCondition {
  const winRate = calculateWinRate(items)
  const edge = winRate - 50
  const trades = items.length
  const avgReturn = calculateAverageReturn(items)
  const totalPnl = items.reduce((acc, o) => acc + o.realizedPnl, 0)
  const stdDev = calculateStdDev(items)

  // Skill confidence classification:
  // 50+ trades with edge > 5% = high confidence (statistically significant)
  // 20-50 trades with edge > 5% = moderate confidence
  // <20 trades or edge < 2% = low confidence
  // <5 trades = insufficient data
  let skillConfidence: 'high-confidence' | 'moderate-confidence' | 'low-confidence' | 'insufficient-data'

  if (trades < 5) {
    skillConfidence = 'insufficient-data'
  } else if (trades >= 50 && Math.abs(edge) > 5) {
    skillConfidence = 'high-confidence'
  } else if (trades >= 20 && Math.abs(edge) > 5) {
    skillConfidence = 'moderate-confidence'
  } else if (Math.abs(edge) >= 2) {
    skillConfidence = 'low-confidence'
  } else {
    skillConfidence = 'low-confidence'
  }

  return {
    condition,
    trades,
    winRate,
    edge,
    skillConfidence,
    avgReturn,
    totalPnl,
    stdDev,
  }
}

export function groupOutcomesByErrorType(outcomes: OutcomeAnalytics[]): ErrorFrequency[] {
  const errorMap = new Map<string, { count: number; losses: number[] }>()

  outcomes.forEach((o) => {
    o.errorTypes.forEach((errorType) => {
      if (!errorMap.has(errorType)) {
        errorMap.set(errorType, { count: 0, losses: [] })
      }
      const entry = errorMap.get(errorType)!
      entry.count++
      if (o.realizedPnl < 0) {
        entry.losses.push(Math.abs(o.realizedPnl))
      }
    })
  })

  return Array.from(errorMap.entries())
    .map(([errorType, data]) => ({
      errorType: errorType as ErrorType,
      count: data.count,
      avgLossImpact: data.losses.length > 0 ? data.losses.reduce((a, b) => a + b) / data.losses.length : 0,
      totalLossImpact: data.losses.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.count - a.count)
}

export function calculateProcessOutcomeMatrix(outcomes: OutcomeAnalytics[]): ProcessOutcomeQuadrant[] {
  const quadrants = [
    { processQuality: 'good' as const, outcomeQuality: 'good' as const },
    { processQuality: 'good' as const, outcomeQuality: 'bad' as const },
    { processQuality: 'bad' as const, outcomeQuality: 'good' as const },
    { processQuality: 'bad' as const, outcomeQuality: 'bad' as const },
  ]

  const total = outcomes.filter((o) => o.processQuality && o.outcomeQuality).length

  return quadrants.map((quad) => {
    const count = outcomes.filter(
      (o) => o.processQuality === quad.processQuality && o.outcomeQuality === quad.outcomeQuality
    ).length

    return {
      ...quad,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }
  })
}

export function getReturnDistribution(outcomes: OutcomeAnalytics[]): ReturnBin[] {
  const bins: ReturnBin[] = [
    { label: '<-20%', min: -Infinity, max: -20, count: 0, percentage: 0 },
    { label: '-20% to -5%', min: -20, max: -5, count: 0, percentage: 0 },
    { label: '-5% to +5%', min: -5, max: 5, count: 0, percentage: 0 },
    { label: '+5% to +20%', min: 5, max: 20, count: 0, percentage: 0 },
    { label: '+20% to +50%', min: 20, max: 50, count: 0, percentage: 0 },
    { label: '>+50%', min: 50, max: Infinity, count: 0, percentage: 0 },
  ]

  const withReturn = outcomes.filter((o) => o.returnPercent != null)
  withReturn.forEach((o) => {
    const bin = bins.find((b) => o.returnPercent! >= b.min && o.returnPercent! < b.max)
    if (bin) bin.count++
  })

  const total = withReturn.length
  bins.forEach((bin) => {
    bin.percentage = total > 0 ? (bin.count / total) * 100 : 0
  })

  return bins
}

export function getHoldingPeriodDistribution(outcomes: OutcomeAnalytics[]): HoldingPeriodBin[] {
  const bins: HoldingPeriodBin[] = [
    { label: '<1 week', minDays: 0, maxDays: 7, count: 0, percentage: 0, avgReturn: 0 },
    { label: '1-2 weeks', minDays: 7, maxDays: 14, count: 0, percentage: 0, avgReturn: 0 },
    { label: '2-4 weeks', minDays: 14, maxDays: 28, count: 0, percentage: 0, avgReturn: 0 },
    { label: '1-3 months', minDays: 28, maxDays: 90, count: 0, percentage: 0, avgReturn: 0 },
    { label: '3-6 months', minDays: 90, maxDays: 180, count: 0, percentage: 0, avgReturn: 0 },
    { label: '>6 months', minDays: 180, maxDays: Infinity, count: 0, percentage: 0, avgReturn: 0 },
  ]

  const binData = bins.map((b) => ({ ...b, returns: [] as number[] }))

  outcomes.forEach((o) => {
    const bin = binData.find((b) => o.holdingDays >= b.minDays && o.holdingDays < b.maxDays)
    if (bin) {
      bin.count++
      if (o.returnPercent != null) {
        bin.returns.push(o.returnPercent)
      }
    }
  })

  const total = outcomes.length
  return binData.map((bin) => ({
    ...bin,
    percentage: total > 0 ? (bin.count / total) * 100 : 0,
    avgReturn: bin.returns.length > 0 ? bin.returns.reduce((a, b) => a + b) / bin.returns.length : 0,
  }))
}

/**
 * Calculate comprehensive metrics snapshot for given outcomes
 */
export function calculateMetricsSnapshot(outcomes: OutcomeAnalytics[]): MetricsSnapshot {
  const winningTrades = outcomes.filter((o) => o.realizedPnl > 0).length
  const losingTrades = outcomes.filter((o) => o.realizedPnl < 0).length

  return {
    winRate: calculateWinRate(outcomes),
    totalTrades: outcomes.length,
    winningTrades,
    losingTrades,
    averageReturn: calculateAverageReturn(outcomes),
    medianReturn: calculateMedianReturn(outcomes),
    cagr: calculateCAGR(outcomes),
    payoffRatio: calculatePayoffRatio(outcomes),
    sharpeRatio: calculateSharpeRatio(outcomes),
    maxDrawdown: calculateMaxDrawdown(outcomes),
    percentPositive: outcomes.length > 0 ? (winningTrades / outcomes.length) * 100 : 0,
    percentNegative: outcomes.length > 0 ? (losingTrades / outcomes.length) * 100 : 0,
    totalRealizedPnl: outcomes.reduce((acc, o) => acc + o.realizedPnl, 0),
    bestTrade: (() => { const r = outcomes.filter((o) => o.returnPercent != null); return r.length > 0 ? Math.max(...r.map((o) => o.returnPercent!)) : 0 })(),
    worstTrade: (() => { const r = outcomes.filter((o) => o.returnPercent != null); return r.length > 0 ? Math.min(...r.map((o) => o.returnPercent!)) : 0 })(),
  }
}

/**
 * Generate complete analytics snapshot with filters applied
 */
export async function generateAnalyticsSnapshot(filter?: AnalyticsFilter): Promise<AnalyticsSnapshot> {
  const allOutcomes = await fetchOutcomesWithContext()
  const filtered = filter ? applyFilter(allOutcomes, filter) : allOutcomes

  const metrics = calculateMetricsSnapshot(filtered)
  const byTicker = groupOutcomesByTicker(filtered)
  const byActionType = groupOutcomesByType(filtered)
  const byMarketFeeling = groupOutcomesByMarketFeeling(filtered)
  const skillVsLuck = analyzeSkillVsLuck(filtered)
  const errorFrequency = groupOutcomesByErrorType(filtered)
  const processOutcomeMatrix = calculateProcessOutcomeMatrix(filtered)
  const returnDistribution = getReturnDistribution(filtered)
  const holdingPeriodDistribution = getHoldingPeriodDistribution(filtered)

  return {
    metrics,
    byTicker,
    byActionType,
    byMarketFeeling,
    skillVsLuck,
    errorFrequency,
    processOutcomeMatrix,
    returnDistribution,
    holdingPeriodDistribution,
    filteredCount: filtered.length,
    totalCount: allOutcomes.length,
  }
}

/**
 * Prediction Calibration Analysis
 * Measures how well predictions match actual outcomes to identify forecast accuracy patterns
 */

export interface PredictionCalibrationBin {
  confidenceRange: string // e.g., "60-70%"
  minConfidence: number
  maxConfidence: number
  totalPredictions: number
  correctPredictions: number
  accuracy: number // 0-100
  calibration: number // accuracy - confidence (negative = overconfident, positive = underconfident)
}

export interface PredictionCalibrationSnapshot {
  bins: PredictionCalibrationBin[]
  overallAccuracy: number
  totalPredictions: number
  biasSummary: 'overconfident' | 'underconfident' | 'well-calibrated'
  recommendations: string[]
}

/**
 * Calculate prediction calibration: how often are return predictions directionally correct?
 * predictions.probability = expected return % (e.g. 15 means "I expect +15%")
 * Accuracy = was the direction right (both positive or both negative)?
 */
export async function calculatePredictionCalibration(): Promise<PredictionCalibrationSnapshot> {
  const { listAllPredictions } = await import('./predictionsService')
  const [allPredictions, outcomes, actions, entries] = await Promise.all([
    listAllPredictions(),
    listOutcomes(),
    listActions(),
    listEntries(),
  ])

  // Build a set of automated entry IDs so we can exclude them from calibration.
  const automatedEntryIds = new Set(
    entries.filter(isAutomatedEntry).map((e) => e.id),
  )

  // Build lookup maps — only include actions tied to real (non-automated) entries.
  const outcomeByActionId = new Map(outcomes.map((o) => [o.action_id, o]))
  const actionByEntryId = new Map(
    actions
      .filter((a): a is typeof a & { entry_id: string } => a.entry_id != null && !automatedEntryIds.has(a.entry_id))
      .map((a) => [a.entry_id, a]),
  )

  const today = new Date().toISOString().split('T')[0]
  const predictions = []

  for (const pred of allPredictions) {
    const action = actionByEntryId.get(pred.entry_id)
    const outcome = action ? outcomeByActionId.get(action.id) : null

    if (outcome) {
      // Has a resolved outcome — evaluate directional accuracy
      const decisionPrice = action ? parsePrice(action.price) : 0
      const actualReturn = (outcome.realized_pnl !== null && action?.shares && decisionPrice > 0)
        ? Math.max(-100, (outcome.realized_pnl / (action.shares * decisionPrice)) * 100)
        : null

      if (actualReturn !== null) {
        // Directionally correct = both positive, both negative, or both ~zero
        const predDir = pred.probability > 2 ? 'up' : pred.probability < -2 ? 'down' : 'flat'
        const actualDir = actualReturn > 2 ? 'up' : actualReturn < -2 ? 'down' : 'flat'
        const wasCorrect = predDir === actualDir

        predictions.push({
          confidence: pred.probability,
          actualReturn,
          wasCorrect,
          date: pred.created_at,
          resolved: true,
        })
      }
    } else if (pred.end_date <= today) {
      // Past end date but no outcome recorded — count as unresolved (direction unknown)
      // Only include if action exists (so it's a real trade decision)
      if (action) {
        predictions.push({
          confidence: pred.probability,
          actualReturn: null,
          wasCorrect: false, // unresolved, pessimistically counted
          date: pred.created_at,
          resolved: false,
        })
      }
    }
    // Future predictions (end_date > today) are excluded — not yet evaluable
  }

  // Group into predicted-return bins (bearish → bullish)
  // calibration here = accuracy - 50 (are you better than random at this range?)
  const bins: PredictionCalibrationBin[] = []
  const binRanges = [
    { min: -Infinity, max: -20, label: 'Very Bearish (<-20%)' },
    { min: -20, max: -5, label: 'Bearish (-20% to -5%)' },
    { min: -5, max: 5, label: 'Neutral (-5% to +5%)' },
    { min: 5, max: 20, label: 'Bullish (+5% to +20%)' },
    { min: 20, max: Infinity, label: 'Very Bullish (>+20%)' },
  ]

  const resolvedPredictions = predictions.filter((p) => p.resolved)

  for (const range of binRanges) {
    const binPredictions = resolvedPredictions.filter((p) => p.confidence > range.min && p.confidence <= range.max)
    const correctCount = binPredictions.filter((p) => p.wasCorrect).length
    const accuracy = binPredictions.length > 0 ? (correctCount / binPredictions.length) * 100 : 0

    bins.push({
      confidenceRange: range.label,
      minConfidence: isFinite(range.min) ? range.min : -100,
      maxConfidence: isFinite(range.max) ? range.max : 200,
      totalPredictions: binPredictions.length,
      correctPredictions: correctCount,
      accuracy,
      calibration: accuracy - 50, // 0 = random, positive = skill (better than coin flip), negative = anti-edge
    })
  }

  // Calculate overall directional accuracy
  const totalPredictions = resolvedPredictions.length
  const correctPredictions = resolvedPredictions.filter((p) => p.wasCorrect).length
  const overallAccuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0

  // Bias based on overall accuracy vs 50% (coin flip baseline)
  // Need at least 5 resolved predictions before drawing conclusions
  const biasSummary: 'overconfident' | 'underconfident' | 'well-calibrated' =
    totalPredictions < 5
      ? 'well-calibrated'
      : overallAccuracy < 45
        ? 'overconfident'
        : overallAccuracy > 65
          ? 'underconfident'
          : 'well-calibrated'

  // Generate recommendations
  const recommendations: string[] = []
  if (totalPredictions === 0) {
    recommendations.push('No resolved predictions yet. Add return predictions on entries when making decisions, then record outcomes to see calibration data.')
  } else if (overallAccuracy < 45) {
    recommendations.push(`Your directional accuracy is below 50% (${overallAccuracy.toFixed(0)}%). Your predictions are slightly contrarian — the opposite direction has been more accurate.`)
  } else if (overallAccuracy > 70) {
    recommendations.push(`Strong directional accuracy (${overallAccuracy.toFixed(0)}%)! You have a genuine edge in predicting market direction.`)
  }

  const worstBin = bins.filter((b) => b.totalPredictions >= 3).sort((a, b) => a.accuracy - b.accuracy)[0]
  if (worstBin && worstBin.accuracy < 35) {
    recommendations.push(`Your ${worstBin.confidenceRange} predictions are often wrong (${worstBin.accuracy.toFixed(0)}% directional accuracy). Consider trading smaller or avoiding this conviction level.`)
  }

  const bestBin = bins.filter((b) => b.totalPredictions >= 3).sort((a, b) => b.accuracy - a.accuracy)[0]
  if (bestBin && bestBin.accuracy > 70) {
    recommendations.push(`Your ${bestBin.confidenceRange} predictions are your strongest (${bestBin.accuracy.toFixed(0)}% accurate). Consider sizing up when you have this level of conviction.`)
  }

  if (totalPredictions > 0 && totalPredictions < 20) {
    recommendations.push(`Only ${totalPredictions} resolved prediction${totalPredictions === 1 ? '' : 's'} analyzed. Collect more data (20+) for reliable insights.`)
  }

  return {
    bins,
    overallAccuracy,
    totalPredictions,
    biasSummary,
    recommendations,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parsePrice(priceStr: string | null): number {
  if (!priceStr) return 0
  const cleaned = priceStr.replace(/[$,]/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

// ============================================================================
// PER-SUB-SKILL BRIER
// ============================================================================

import type { SubSkill } from '../types/subSkills'

export interface SubSkillBrierStat {
  subSkill: SubSkill | 'unassigned'
  resolvedCount: number
  /** Brier = mean((forecast - outcome)^2). 0 = perfect, 0.25 = random, higher = worse. */
  brier: number
  /** Raw directional accuracy for a secondary view. */
  accuracy: number
}

export interface PerSubSkillBrierSnapshot {
  stats: SubSkillBrierStat[]
  /** The sub-skill with the worst Brier given min sample size. Null if nothing qualifies. */
  weakest: SubSkillBrierStat | null
  /** The sub-skill with the best Brier given min sample size. */
  strongest: SubSkillBrierStat | null
  /** Minimum resolved predictions before a sub-skill is ranked. */
  minSampleSize: number
}

/**
 * Compute Brier score + accuracy per sub-skill. A prediction resolves when the
 * action it's attached to has an outcome recorded. For each resolved prediction:
 *
 *   forecast = prediction.probability / 100 — probability the directional call is correct
 *   outcome  = 1 if the actual realized return direction matches prediction direction,
 *              else 0
 *
 * Predictions without an outcome or without a resolvable direction are ignored.
 * Sub-skill is read from the `sub_skill` field; rows with no sub-skill are grouped
 * under 'unassigned'.
 */
export async function calculatePerSubSkillBrier(minSampleSize = 3): Promise<PerSubSkillBrierSnapshot> {
  const { listAllPredictions } = await import('./predictionsService')
  const [allPredictions, outcomes, actions, entries] = await Promise.all([
    listAllPredictions(),
    listOutcomes(),
    listActions(),
    listEntries(),
  ])

  // Exclude automated IBKR entries from Brier calculations.
  const automatedEntryIds = new Set(
    entries.filter(isAutomatedEntry).map((e) => e.id),
  )

  const outcomeByActionId = new Map(outcomes.map((o) => [o.action_id, o]))
  const actionByEntryId = new Map(
    actions
      .filter((a): a is typeof a & { entry_id: string } => a.entry_id != null && !automatedEntryIds.has(a.entry_id))
      .map((a) => [a.entry_id, a]),
  )

  type ScoredPrediction = { subSkill: string; forecast: number; correct: number }
  const byKey = new Map<string, ScoredPrediction[]>()

  for (const pred of allPredictions) {
    const action = actionByEntryId.get(pred.entry_id)
    if (!action) continue
    const outcome = outcomeByActionId.get(action.id)
    if (!outcome) continue

    const decisionPrice = parsePrice(action.price)
    if (outcome.realized_pnl == null || !action.shares || decisionPrice <= 0) continue

    const actualReturnPct = (outcome.realized_pnl / (action.shares * decisionPrice)) * 100

    // Predictions store probability 0-100 which we treat as "how confident am I the direction is right"
    // In practice, `probability` in this codebase can also be an expected return %. To keep the
    // Brier well-defined we clamp: value >= 50 means bullish conviction, value < 50 means bearish,
    // probability of being correct = probability / 100 when >= 50, else (100 - probability)/100.
    const p = Math.max(0, Math.min(100, pred.probability))
    const predictedBullish = p >= 50
    const probCorrect = predictedBullish ? p / 100 : (100 - p) / 100

    const actualBullish = actualReturnPct > 0
    const correct = predictedBullish === actualBullish ? 1 : 0

    const key = pred.sub_skill || 'unassigned'
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push({ subSkill: key, forecast: probCorrect, correct })
  }

  const stats: SubSkillBrierStat[] = []
  for (const [key, preds] of byKey) {
    if (preds.length === 0) continue
    const brier = preds.reduce((sum, p) => sum + Math.pow(p.forecast - p.correct, 2), 0) / preds.length
    const accuracy = (preds.filter((p) => p.correct === 1).length / preds.length) * 100
    stats.push({
      subSkill: key as SubSkill | 'unassigned',
      resolvedCount: preds.length,
      brier,
      accuracy,
    })
  }

  // Sort by Brier ascending (best first)
  stats.sort((a, b) => a.brier - b.brier)

  const ranked = stats.filter((s) => s.resolvedCount >= minSampleSize && s.subSkill !== 'unassigned')
  const strongest = ranked.length > 0 ? ranked[0] : null
  const weakest = ranked.length > 0 ? ranked[ranked.length - 1] : null

  return { stats, weakest, strongest, minSampleSize }
}
