/**
 * Analytics types for outcome tracking and performance analysis
 */

import type { ActionType, ErrorType } from './database'

export interface OutcomeAnalytics {
  actionId: string
  entryId: string
  ticker: string
  type: ActionType
  decisionDate: string // YYYY-MM-DD
  decisionPrice: number
  shares: number | null
  outcomeDate: string // YYYY-MM-DD
  finalPrice: number
  realizedPnl: number // in dollars
  returnPercent: number | null // -100 to +300 (%), null when cost basis unknown
  holdingDays: number
  processQuality: 'good' | 'bad' | null
  outcomeQuality: 'good' | 'bad' | null
  /** R19: 1-5 process score (research, reasoning, bias-awareness, rule-following) */
  processScore: number | null
  /** R19: 1-5 outcome score (did the trade actually make money) */
  outcomeScore: number | null
  driver: 'thesis' | 'other' | null // what drove the result?
  errorTypes: ErrorType[] // analytical, informational, behavioral, sizing, timing
  marketConditions: string[] // from entry context
  marketFeeling: number | null // 1-10 fear to greed
  sentiment: number | null // -100 to +100 (from fear/greed index)
}

export interface MetricsSnapshot {
  winRate: number // 0-100 (% of profitable trades)
  totalTrades: number
  winningTrades: number
  losingTrades: number
  averageReturn: number // percent
  medianReturn: number // percent
  cagr: number // compound annual growth rate
  payoffRatio: number // avg win size / avg loss size
  sharpeRatio: number // risk-adjusted return
  maxDrawdown: number // largest peak-to-trough decline
  percentPositive: number // % of trades with positive return
  percentNegative: number // % of trades with negative return
  totalRealizedPnl: number // sum of all P&L in dollars
  bestTrade: number // best single trade return %
  worstTrade: number // worst single trade return %
}

export interface PerformanceByTicker {
  ticker: string
  trades: number
  winRate: number
  avgReturn: number
  medianReturn: number
  cagr: number
  totalPnl: number
  bestTrade: {
    date: string
    returnPercent: number
  }
  worstTrade: {
    date: string
    returnPercent: number
  }
}

export interface PerformanceByActionType {
  type: ActionType
  trades: number
  winRate: number
  avgReturn: number
  medianReturn: number
  totalPnl: number
}

export interface PerformanceByMarketFeeling {
  feelingBin: string // '1-3 Fear', '4-7 Neutral', '8-10 Greed'
  minFeeling: number
  maxFeeling: number
  trades: number
  winRate: number
  avgReturn: number
  medianReturn: number
  totalPnl: number
}

export interface SkillVsLuckCondition {
  condition: string // 'Bull Market', 'High Volatility', etc.
  trades: number
  winRate: number
  edge: number // winRate - 50 (positive = edge, negative = anti-edge)
  skillConfidence: 'high-confidence' | 'moderate-confidence' | 'low-confidence' | 'insufficient-data'
  avgReturn: number
  totalPnl: number
  stdDev: number // consistency/volatility of returns
}

export interface ErrorFrequency {
  errorType: ErrorType
  count: number
  avgLossImpact: number // average negative impact when this error occurred
  totalLossImpact: number // sum of negative impacts
}

export interface ProcessOutcomeQuadrant {
  processQuality: 'good' | 'bad'
  outcomeQuality: 'good' | 'bad'
  count: number
  percentage: number
}

export interface ReturnBin {
  label: string // '<-20%', '-20% to -5%', etc.
  min: number
  max: number
  count: number
  percentage: number
}

export interface HoldingPeriodBin {
  label: string // '<1 week', '1-2 weeks', etc.
  minDays: number
  maxDays: number
  count: number
  percentage: number
  avgReturn: number
}

export interface AnalyticsFilter {
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  tickers?: string[] // filter to specific tickers
  actionTypes?: ActionType[] // filter to specific action types
  marketConditions?: string[] // filter to specific conditions
  sentimentRange?: [number, number] // fear/greed index range
  processQuality?: 'good' | 'bad' | null // filter by process quality
  minTrades?: number // only groups with at least N trades
}

export interface AnalyticsSnapshot {
  metrics: MetricsSnapshot
  byTicker: PerformanceByTicker[]
  byActionType: PerformanceByActionType[]
  byMarketFeeling: PerformanceByMarketFeeling[]
  skillVsLuck: SkillVsLuckCondition[]
  errorFrequency: ErrorFrequency[]
  processOutcomeMatrix: ProcessOutcomeQuadrant[]
  returnDistribution: ReturnBin[]
  holdingPeriodDistribution: HoldingPeriodBin[]
  filteredCount: number
  totalCount: number
}
