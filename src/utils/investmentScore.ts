/**
 * Speculation<->Investment continuous score, 0..100.
 *
 *   0..30   = pure speculation (short-dated, no writeup, degen)
 *   30..70  = mixed / ambiguous
 *   70..100 = long-term fundamental investment with full thesis
 *
 * The score is computed from a weighted signal stack starting at a base of 45.
 * Each signal adds or subtracts a deterministic amount. The result is clipped to
 * [0, 100] and returned alongside the list of contributing signals so the UI can
 * explain *why* something scored what it did ("+25 body writeup, +15 wizard, −8 closed in 5 days").
 *
 * This function is PURE — no DB, no network. Callers pre-fetch any data they want
 * the score to account for (e.g. historical underlying price for options moneyness).
 * That makes it trivially unit-testable and usable from both the client and the
 * Node backfill script (whose port lives at scripts/lib/investmentScore.mjs and
 * MUST be kept in lockstep with this file).
 */

export interface SignalContribution {
  label: string
  weight: number
}

export interface ScoringResult {
  /** Clipped 0..100 */
  score: number
  /** Category label derived from the score band */
  bucket: 'Spec' | 'Mixed' | 'Invest'
  /** Ordered list of non-zero contributions (by absolute weight, desc) */
  contributions: SignalContribution[]
}

export interface EntryForScoring {
  body_markdown: string | null | undefined
  tags: string[] | null | undefined
}

export interface ActionForScoring {
  type: string
  action_date: string | null | undefined
  kill_criteria?: string | null
  pre_mortem_text?: string | null
  raw_snippet?: string | null
  notes?: string | null
  /** IBKR parser asset class — when provided we can branch option-specific logic */
  assetClass?: string | null
  /** Parsed option data — callers compute via optionSymbol.ts when type is option */
  optionData?: {
    dteAtOpen: number | null
    moneynessAtOpen: number | null
    isLeap: boolean
  } | null
}

export interface PredictionForScoring {
  end_date: string | null | undefined
  created_at?: string | null
  sub_skill?: string | null
}

export interface OutcomeForScoring {
  outcome_date: string | null | undefined
}

export interface ScoringInput {
  entry: EntryForScoring
  actions: ActionForScoring[]
  predictions?: PredictionForScoring[]
  /** First outcome on any linked action — used to detect quick-flip behaviour */
  earliestOutcome?: OutcomeForScoring | null
}

const SPEC_TAGS = ['yolo', 'lotto', 'speculate', 'speculation', 'meme', 'weekly', 'gamble', 'degen', '0dte']
const INVEST_TAGS = ['long-term', 'longterm', 'compounder', 'thesis', 'invest', 'investment', 'leap', 'leaps']

function daysBetween(a: string, b: string): number {
  const ad = new Date(a).getTime()
  const bd = new Date(b).getTime()
  if (!Number.isFinite(ad) || !Number.isFinite(bd)) return Infinity
  return Math.abs(bd - ad) / 86400000
}

/**
 * Compute the speculation-investment score and the contributing signals.
 * See the module docstring for scoring philosophy and weights.
 */
export function computeInvestmentScore(input: ScoringInput): ScoringResult {
  const { entry, actions, predictions = [], earliestOutcome = null } = input
  const contributions: SignalContribution[] = []
  let score = 45 // base shifted from 50 to push entries without signals toward Spec

  const add = (label: string, weight: number) => {
    if (weight === 0) return
    contributions.push({ label, weight })
    score += weight
  }

  // ── Structure: writeup length ─────────────────────────────────────────
  const body = (entry.body_markdown ?? '').trim()
  const bodyChars = body.length
  if (bodyChars === 0) {
    add('No journal writeup', -20)
  } else if (bodyChars < 30) {
    add('Token writeup (<30 chars)', -5)
  } else if (bodyChars < 200) {
    add('Minimal writeup (30–200 chars)', +5)
  } else if (bodyChars < 800) {
    add('Standard writeup (200–800 chars)', +15)
  } else {
    add('Detailed writeup (800+ chars)', +30)
  }

  // ── Structure: forced-process artefacts ───────────────────────────────
  const firstEntryAction = actions[0]
  if (firstEntryAction?.kill_criteria && firstEntryAction.kill_criteria.trim().length > 0) {
    add('Kill criteria set', +15)
  }
  if (firstEntryAction?.pre_mortem_text && firstEntryAction.pre_mortem_text.trim().length > 0) {
    add('Pre-mortem written', +8)
  }
  // Pre-commitment wizard stamps a marker in notes; alternatively users of the wizard
  // always have both kill_criteria and pre_mortem_text, so this is a bonus, not primary signal.
  const anyNotes = actions.map((a) => a.notes ?? '').join('\n')
  if (/Sub-prediction/i.test(anyNotes) && /Risks/i.test(anyNotes)) {
    add('Pre-commitment wizard', +15)
  }

  // ── Structure: explicit tags ──────────────────────────────────────────
  const tagsLower = (entry.tags ?? []).map((t) => t.toLowerCase().trim())
  const hasInvestTag = tagsLower.some((t) => INVEST_TAGS.includes(t))
  const hasSpecTag = tagsLower.some((t) => SPEC_TAGS.includes(t))
  if (hasInvestTag) add('Tagged as investment/LEAP', +10)
  if (hasSpecTag) add('Tagged as speculation/yolo', -20)

  // ── Structure: sub-predictions attached ───────────────────────────────
  const longHorizonPredictions = predictions.filter((p) => {
    if (!p.end_date || !firstEntryAction?.action_date) return false
    return daysBetween(firstEntryAction.action_date, p.end_date) >= 180
  })
  if (longHorizonPredictions.length > 0) {
    add(`Long-horizon prediction${longHorizonPredictions.length > 1 ? 's' : ''} attached`, +8)
  } else if (predictions.length === 0 && bodyChars < 200) {
    // Only penalise absence when the writeup is also thin — otherwise a good thesis
    // without a formal prediction shouldn't be punished.
    add('No sub-prediction linked', -5)
  }

  // ── Structure: deliberate-practice sub-skill tracking ─────────────────
  const hasSubSkillPrediction = predictions.some((p) => p.sub_skill && p.sub_skill.trim().length > 0)
  if (hasSubSkillPrediction) {
    add('Prediction with sub-skill tracking', +10)
  }

  // ── Option-specific signals ───────────────────────────────────────────
  // Determine if *any* action on this entry is an option, and use its data.
  const optionAction = actions.find((a) => a.assetClass === 'Equity and Index Options' || a.optionData != null)
  if (optionAction?.optionData) {
    const { dteAtOpen, moneynessAtOpen, isLeap } = optionAction.optionData

    if (isLeap) {
      add('LEAP (DTE at open > 365d)', +10)
    } else if (dteAtOpen != null) {
      if (dteAtOpen < 14) add('Option DTE < 14d at open', -25)
      else if (dteAtOpen < 45) add('Option DTE 14–45d at open', -10)
      else if (dteAtOpen < 180) add('Option DTE 45–180d at open', -3)
      // 180..365 neutral
    }

    if (moneynessAtOpen != null) {
      if (moneynessAtOpen > 0.3) add('Deep OTM / ITM at open (>30%)', -15)
      else if (moneynessAtOpen > 0.15) add('OTM at open (15–30%)', -6)
      // <15% neutral
    }
  }

  // ── Behaviour: quick flip ─────────────────────────────────────────────
  if (earliestOutcome?.outcome_date && firstEntryAction?.action_date) {
    const days = daysBetween(firstEntryAction.action_date, earliestOutcome.outcome_date)
    if (days < 7) add('Closed within 7 days (quick flip)', -8)
  }

  // ── Clip and classify ─────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, Math.round(score)))
  let bucket: 'Spec' | 'Mixed' | 'Invest'
  if (score < 30) bucket = 'Spec'
  else if (score < 70) bucket = 'Mixed'
  else bucket = 'Invest'

  contributions.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
  return { score, bucket, contributions }
}

/** Short label for the cards on the Journal page. No emoji icons. */
export function investmentScoreBadge(score: number | null): { label: string; color: string } {
  if (score == null) return { label: '—', color: '#94a3b8' }
  if (score < 30) return { label: `S${score}`, color: '#dc2626' }
  if (score < 70) return { label: `M${score}`, color: '#ca8a04' }
  return { label: `I${score}`, color: '#16a34a' }
}
