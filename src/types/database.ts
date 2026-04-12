// Database row types (match supabase/migrations)

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  user_id: string
  entry_id: string
  date: string
  author: string
  tags: string[]
  title_markdown: string
  body_markdown: string
  /** Market conditions captured at entry time (comma-separated: "Bull Market, High Volatility") */
  market_context?: string | null
  /** Market feeling 1-10 (1=fear/😨, 10=greed/🤯), captured at entry time */
  market_feeling?: number | null
  /** Trading plan: entry rules, exit rules, risk limits, profit targets */
  trading_plan?: string | null
  /** Expected resolution date for long-term decisions (e.g., "2026-06-30") */
  decision_horizon?: string | null
  /** Broker import tracking: UUID of broker_imports record this entry was created from */
  broker_import_id?: string | null
  /** Unique trade ID from broker (e.g., IBKR tradeID) for deduplication */
  broker_trade_id?: string | null
  /** Broker name: 'IBKR', 'XTB', etc. */
  broker_name?: string | null
  /** true if entry was auto-created from broker import, false if manually entered */
  is_auto_imported?: boolean
  /** Speculation<->Investment continuous score 0..100. Auto-computed from signal stack. */
  investment_score?: number | null
  /** User manual override for investment_score. When null, UI uses investment_score. */
  investment_score_override?: number | null
  created_at: string
  updated_at: string
}

export type EntryInsert = Omit<Entry, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
  broker_import_id?: string | null
  broker_trade_id?: string | null
  broker_name?: string | null
  is_auto_imported?: boolean
}

export type EntryUpdate = Partial<Omit<Entry, 'id' | 'user_id' | 'created_at'>>

export const ACTION_TYPES = [
  'buy',
  'sell',
  'short',
  'cover',
  'trim',
  'hold',
  'pass',
  'speculate',
  'add_more',
  'research',
  'watchlist',
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export interface Action {
  id: string
  entry_id: string
  type: ActionType
  ticker: string
  company_name: string | null
  action_date: string
  price: string
  currency: string | null
  shares: number | null
  reason: string
  notes: string
  /** Pre-commit exit conditions: e.g. "If [X], I reassess or sell" (F8) */
  kill_criteria?: string | null
  /** F22: If this decision fails, what is the most likely reason? */
  pre_mortem_text?: string | null
  raw_snippet: string | null
  created_at: string
  updated_at: string
}

export type ActionInsert = Omit<Action, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
  raw_snippet?: string | null
}

export type ActionUpdate = Partial<Omit<Action, 'id' | 'entry_id' | 'created_at'>>

export type OutcomeDriver = 'thesis' | 'other' | null

/** F12: Good/bad process × good/bad outcome */
export type ProcessOutcomeQuality = 'good' | 'bad' | null

/** F21: Error taxonomy for closed decisions */
export const ERROR_TYPES = ['analytical', 'informational', 'behavioral', 'sizing', 'timing'] as const
export type ErrorType = (typeof ERROR_TYPES)[number]

export interface Outcome {
  id: string
  action_id: string
  realized_pnl: number | null
  outcome_date: string
  notes: string
  driver?: OutcomeDriver
  /** Structured post-mortem: what to do differently (F13) */
  post_mortem_notes?: string | null
  /** F12: Was the decision process good? (binary — superseded by process_score for new data) */
  process_quality?: ProcessOutcomeQuality
  /** F12: Was the outcome good? (binary — superseded by outcome_score for new data) */
  outcome_quality?: ProcessOutcomeQuality
  /** Process score 1-5: research, reasoning, bias-awareness, rule-following. */
  process_score?: number | null
  /** Outcome score 1-5: did the trade actually make money. */
  outcome_score?: number | null
  /** Closing memo (500 words max): original thesis, outcome, reasoning errors, do-differently, recurring theme. */
  closing_memo?: string | null
  /** F21: Error taxonomy (weakness profile) */
  error_type?: ErrorType[] | null
  /** F29: "What I remember now" — compare to pre-decision record to surface hindsight bias */
  what_i_remember_now?: string | null
  /** Broker import tracking: UUID of broker_imports record for dividend/income tracking */
  linked_dividend_id?: string | null
  created_at: string
  updated_at: string
}

export type OutcomeInsert = Omit<Outcome, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
  driver?: OutcomeDriver
  post_mortem_notes?: string | null
  process_quality?: ProcessOutcomeQuality
  outcome_quality?: ProcessOutcomeQuality
  process_score?: number | null
  outcome_score?: number | null
  closing_memo?: string | null
  error_type?: ErrorType[] | null
  what_i_remember_now?: string | null
  linked_dividend_id?: string | null
}

export type OutcomeUpdate = Partial<Omit<Outcome, 'id' | 'action_id' | 'created_at'>>

export type PassReviewStatus = 'correct' | 'should_have_bought' | 'inconclusive'

export interface Passed {
  id: string
  user_id: string
  ticker: string
  passed_date: string
  reason: string
  notes: string
  /** Date at which the Activity drawer prompts a retrospective review. */
  follow_up_date?: string | null
  /** Retrospective verdict: 'correct' | 'should_have_bought' | 'inconclusive' | null. */
  review_status?: PassReviewStatus | null
  /** When the review was completed. */
  reviewed_at?: string | null
  /** Optional free-form note captured at review time. */
  review_notes?: string | null
  created_at: string
}

export const REMINDER_TYPES = ['entry_review', 'idea_refresh', 'prediction_ended'] as const
export type ReminderType = (typeof REMINDER_TYPES)[number]

export interface Reminder {
  id: string
  user_id: string
  entry_id: string | null
  type: ReminderType
  reminder_date: string
  note: string
  ticker: string
  completed_at: string | null
  created_at: string
}

export type ReminderInsert = Omit<Reminder, 'id' | 'created_at' | 'ticker' | 'completed_at'> & {
  id?: string
  created_at?: string
  entry_id?: string | null
  ticker?: string
  note?: string
  completed_at?: null
}

// v2 parity: Prediction block per entry (Journalytic-style)
export interface EntryPrediction {
  id: string
  entry_id: string
  probability: number
  end_date: string
  type: string
  label: string | null
  ticker: string | null
  /** Which sub-skill this prediction is training (see src/types/subSkills.ts). */
  sub_skill?: string | null
  created_at: string
  updated_at: string
}

export type EntryPredictionInsert = Omit<EntryPrediction, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type EntryPredictionUpdate = Partial<Omit<EntryPrediction, 'id' | 'entry_id' | 'created_at'>>

// John Huber 3 Engines of Value: per-entry projected return decomposition
export interface EntryValuation {
  id: string
  entry_id: string
  /** Earnings (or FCF) growth rate in percent per year */
  earnings_growth_pct: number
  /** Current valuation multiple (P/E, EV/EBITDA, etc.) */
  current_multiple: number
  /** Target multiple at horizon end */
  target_multiple: number
  /** Net shareholder yield percent per year (dividends + buybacks, negative = dilution) */
  shareholder_yield_pct: number
  /** Horizon in years (1..20) */
  horizon_years: number
  /** Per-year multiple curve (length = horizon_years + 1). Null = linear interpolation. */
  multiple_curve?: number[] | null
  notes: string
  created_at: string
  updated_at: string
}

export type EntryValuationInsert = Omit<EntryValuation, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type EntryValuationUpdate = Partial<Omit<EntryValuation, 'id' | 'entry_id' | 'created_at'>>

// v2 parity: Feeling block per entry (Journalytic-style)
export type FeelingType = 'idea' | 'market'

export interface EntryFeeling {
  id: string
  entry_id: string
  score: number
  label: string
  type: FeelingType
  ticker: string | null
  created_at: string
  updated_at: string
}

export type EntryFeelingInsert = Omit<EntryFeeling, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type EntryFeelingUpdate = Partial<Omit<EntryFeeling, 'id' | 'entry_id' | 'created_at'>>

// ============================================================================
// Broker Statement Imports
// ============================================================================

/**
 * BrokerImport: Tracks statement imports from brokers (IBKR, XTB, etc.)
 *
 * Enables:
 * - Audit trail (who imported what, when)
 * - Deduplication (file_hash prevents re-import)
 * - Entry linkage (entries created from this import)
 * - Reproducibility (full parsed_data cached for re-analysis)
 */
export interface BrokerImport {
  id: string
  user_id: string

  // Broker identification
  broker_name: string // 'IBKR', 'XTB', etc.
  statement_type: string // 'FlexReport', 'ActivityStatement', 'CsvDividends', etc.

  // File tracking
  file_name: string
  file_hash: string // SHA256(file) for deduplication

  imported_at: string // ISO timestamp
  trade_count: number
  dividend_count: number

  // Import result
  status: 'pending' | 'success' | 'partial' | 'failed'
  error_message: string | null

  // Full parsed statement data (JSON, immutable for audit trail)
  parsed_data: Record<string, unknown> // ParsedBrokerStatement as JSON

  created_at: string
  updated_at: string
}

export type BrokerImportInsert = Omit<BrokerImport, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type BrokerImportUpdate = Partial<Omit<BrokerImport, 'id' | 'user_id' | 'created_at' | 'file_hash'>>
