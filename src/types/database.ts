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
  // The four broker-tracking columns (`broker_import_id`,
  // `broker_trade_id`, `broker_name`, `is_auto_imported`) still exist
  // on the `entries` table for any historical rows the broker import
  // wrote, but the TypeScript type no longer surfaces them — nothing
  // in the codebase reads or writes them now that the import flow is
  // retired.
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

/**
 * Relative size of a directional trade. Drives the height of the light-cone
 * glow on the timeline chart — bigger trade = taller cone = more visual
 * weight. Meaningful for: buy, sell, add_more, trim, cover, short, speculate.
 * Existing rows were backfilled to 'medium'.
 */
export const ACTION_SIZES = ['tiny', 'small', 'medium', 'large', 'xl'] as const
export type ActionSize = (typeof ACTION_SIZES)[number]

/** Which action types are "directional" and therefore carry a light cone. */
export const DIRECTIONAL_ACTION_TYPES: readonly ActionType[] = [
  'buy', 'sell', 'add_more', 'trim', 'cover', 'short', 'speculate',
]

export function isDirectionalAction(type: ActionType | string | null | undefined): boolean {
  return DIRECTIONAL_ACTION_TYPES.includes(type as ActionType)
}

export interface Action {
  id: string
  /** Owning user — required for RLS even when entry_id is null (standalone decision). */
  user_id: string
  /** Optional: a decision can stand alone without belonging to a journal entry. */
  entry_id: string | null
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
  /** Relative trade size. null for non-directional decisions. Defaults
   *  to 'medium'. Required in the TS model so code paths that build an
   *  Action payload can't silently forget to include it (which the 12-
   *  flow audit on 2026-04-20 noticed was inconsistent — DB column is
   *  NOT NULL with a default, but the TS optional `?` hid that fact). */
  size: ActionSize | null
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

export type ActionUpdate = Partial<Omit<Action, 'id' | 'user_id' | 'created_at'>>

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

// The `BrokerImport` interface + Insert/Update aliases used to live
// here, mirroring the `broker_imports` table that tracked statement
// uploads. Removed alongside the broker-import surface — the table
// itself stays in the DB so existing rows aren't lost, but no
// application code references it anymore.
