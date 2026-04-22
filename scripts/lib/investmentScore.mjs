/**
 * Node-side mirror of src/utils/investmentScore.ts.
 * Kept in lockstep manually — if you change weights in one place, change both.
 * This file intentionally has no TypeScript types and no external imports so it
 * can be used from the backfill script without tsx/esm hoops.
 */

const SPEC_TAGS = ['yolo', 'lotto', 'speculate', 'speculation', 'meme', 'weekly', 'gamble', 'degen', '0dte']
const INVEST_TAGS = ['long-term', 'longterm', 'compounder', 'thesis', 'invest', 'investment', 'leap', 'leaps']

function daysBetween(a, b) {
  const ad = new Date(a).getTime()
  const bd = new Date(b).getTime()
  if (!Number.isFinite(ad) || !Number.isFinite(bd)) return Infinity
  return Math.abs(bd - ad) / 86400000
}

// ── Option symbol parsing (mirror of src/utils/optionSymbol.ts) ────────
const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

function pivot2DigitYear(yy) {
  return yy < 80 ? 2000 + yy : 1900 + yy
}

function parseHumanFormat(symbol) {
  const parts = symbol.trim().split(/\s+/)
  if (parts.length !== 4) return null
  const [ticker, dateStr, strikeStr, rightStr] = parts
  if (rightStr !== 'C' && rightStr !== 'P') return null
  const dateMatch = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/)
  if (!dateMatch) return null
  const [, dayStr, monStr, yyStr] = dateMatch
  const monthNum = MONTHS[monStr]
  if (!monthNum) return null
  const day = parseInt(dayStr, 10).toString().padStart(2, '0')
  const year = pivot2DigitYear(parseInt(yyStr, 10))
  const expiry = `${year}-${monthNum}-${day}`
  const strike = parseFloat(strikeStr)
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right: rightStr }
}

function parseOccFormat(symbol) {
  const m = symbol.match(/^(.+?)\s*(\d{6})([CP])(\d{8})$/)
  if (!m) return null
  const [, rawTicker, dateStr, rightStr, strikeStr] = m
  const ticker = rawTicker.trim()
  if (!ticker) return null
  const yy = parseInt(dateStr.slice(0, 2), 10)
  const mm = parseInt(dateStr.slice(2, 4), 10)
  const dd = parseInt(dateStr.slice(4, 6), 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const year = pivot2DigitYear(yy)
  const expiry = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const strike = parseInt(strikeStr, 10) / 1000
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right: rightStr }
}

export function parseOptionSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null
  const s = symbol.trim()
  if (!s) return null
  return parseOccFormat(s) ?? parseHumanFormat(s)
}

export function computeDteAtOpen(tradeDate, expiry) {
  if (!tradeDate || !expiry) return null
  const t = new Date(tradeDate).getTime()
  const e = new Date(expiry).getTime()
  if (!Number.isFinite(t) || !Number.isFinite(e)) return null
  return Math.round((e - t) / 86400000)
}

export function computeMoneyness(strike, underlyingPrice) {
  if (!Number.isFinite(strike) || !Number.isFinite(underlyingPrice) || underlyingPrice === 0) return null
  return Math.abs(strike - underlyingPrice) / underlyingPrice
}

export function isLeap(dteAtOpen) {
  return dteAtOpen != null && dteAtOpen > 365
}

// ── Scoring logic ──────────────────────────────────────────────────────

/**
 * input: {
 *   entry: { body_markdown, tags },
 *   actions: [{ type, action_date, kill_criteria, pre_mortem_text, notes, assetClass, optionData }],
 *   predictions: [{ end_date, created_at }],
 *   earliestOutcome: { outcome_date } | null,
 * }
 *
 * returns: { score: 0..100, bucket: 'Spec'|'Mixed'|'Invest', contributions: [{label, weight}] }
 */
export function computeInvestmentScore(input) {
  const { entry, actions, predictions = [], earliestOutcome = null } = input
  const contributions = []
  let score = 45 // base shifted from 50 to push entries without signals toward Spec

  const add = (label, weight) => {
    if (weight === 0) return
    contributions.push({ label, weight })
    score += weight
  }

  // Writeup length
  // Recalibrated 2026-04-22: text-only ceiling lowered to +15 so an
  // entry with even a long body alone tops out near 60. The rest of
  // the score comes from STRUCTURED signals. Keep in lockstep with
  // src/utils/investmentScore.ts.
  const body = (entry.body_markdown ?? '').trim()
  const bodyChars = body.length
  if (bodyChars === 0) add('No journal writeup', -20)
  else if (bodyChars < 30) add('Token writeup (<30 chars)', -5)
  else if (bodyChars < 200) add('Minimal writeup (30–200 chars)', +5)
  else if (bodyChars < 800) add('Standard writeup (200–800 chars)', +12)
  else add('Detailed writeup (800+ chars)', +15)

  // Forced-process artefacts
  const firstEntryAction = actions[0]
  if (firstEntryAction?.kill_criteria && String(firstEntryAction.kill_criteria).trim().length > 0) {
    add('Kill criteria set', +15)
  }
  if (firstEntryAction?.pre_mortem_text && String(firstEntryAction.pre_mortem_text).trim().length > 0) {
    add('Pre-mortem written', +8)
  }
  const anyNotes = actions.map((a) => a.notes ?? '').join('\n')
  if (/Sub-prediction/i.test(anyNotes) && /Risks/i.test(anyNotes)) {
    add('Pre-commitment wizard', +15)
  }

  // Explicit tags
  const tagsLower = (entry.tags ?? []).map((t) => String(t).toLowerCase().trim())
  const hasInvestTag = tagsLower.some((t) => INVEST_TAGS.includes(t))
  const hasSpecTag = tagsLower.some((t) => SPEC_TAGS.includes(t))
  if (hasInvestTag) add('Tagged as investment/LEAP', +10)
  if (hasSpecTag) add('Tagged as speculation/yolo', -20)

  // Sub-predictions attached
  const longHorizonPredictions = predictions.filter((p) => {
    if (!p.end_date || !firstEntryAction?.action_date) return false
    return daysBetween(firstEntryAction.action_date, p.end_date) >= 180
  })
  if (longHorizonPredictions.length > 0) {
    add(`Long-horizon prediction${longHorizonPredictions.length > 1 ? 's' : ''} attached`, +8)
  } else if (predictions.length === 0 && bodyChars < 200) {
    add('No sub-prediction linked', -5)
  }

  // Deliberate-practice sub-skill tracking
  const hasSubSkillPrediction = predictions.some((p) => p.sub_skill && String(p.sub_skill).trim().length > 0)
  if (hasSubSkillPrediction) {
    add('Prediction with sub-skill tracking', +10)
  }

  // Option-specific
  const optionAction = actions.find((a) => a.assetClass === 'Equity and Index Options' || a.optionData != null)
  if (optionAction?.optionData) {
    const { dteAtOpen, moneynessAtOpen, isLeap: leap } = optionAction.optionData
    if (leap) add('LEAP (DTE at open > 365d)', +10)
    else if (dteAtOpen != null) {
      if (dteAtOpen < 14) add('Option DTE < 14d at open', -25)
      else if (dteAtOpen < 45) add('Option DTE 14–45d at open', -10)
      else if (dteAtOpen < 180) add('Option DTE 45–180d at open', -3)
    }
    if (moneynessAtOpen != null) {
      if (moneynessAtOpen > 0.3) add('Deep OTM / ITM at open (>30%)', -15)
      else if (moneynessAtOpen > 0.15) add('OTM at open (15–30%)', -6)
    }
  }

  // Quick flip
  if (earliestOutcome?.outcome_date && firstEntryAction?.action_date) {
    const days = daysBetween(firstEntryAction.action_date, earliestOutcome.outcome_date)
    if (days < 7) add('Closed within 7 days (quick flip)', -8)
  }

  // 3-engines valuation (input.hasValuation)
  if (input.hasValuation) {
    add('3-engines valuation set', +10)
  }

  // Clip + bucket
  score = Math.max(0, Math.min(100, Math.round(score)))
  let bucket
  if (score < 30) bucket = 'Spec'
  else if (score < 70) bucket = 'Mixed'
  else bucket = 'Invest'

  contributions.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))

  // Unfired-signal headroom — same logic as the .ts mirror.
  const unfiredSignals = []
  if (!firstEntryAction?.kill_criteria || String(firstEntryAction.kill_criteria).trim().length === 0) {
    unfiredSignals.push({ label: 'Add kill criteria', weight: 15 })
  }
  if (!firstEntryAction?.pre_mortem_text || String(firstEntryAction.pre_mortem_text).trim().length === 0) {
    unfiredSignals.push({ label: 'Add pre-mortem', weight: 8 })
  }
  if (!input.hasValuation) {
    unfiredSignals.push({ label: 'Set 3-engines valuation', weight: 10 })
  }
  if (longHorizonPredictions.length === 0) {
    unfiredSignals.push({ label: 'Add prediction with end date 180+ days out', weight: 8 })
  }
  if (!hasSubSkillPrediction) {
    unfiredSignals.push({ label: 'Tag a prediction with a sub-skill', weight: 10 })
  }
  if (!hasInvestTag) {
    unfiredSignals.push({ label: 'Add long-term / compounder tag', weight: 10 })
  }
  unfiredSignals.sort((a, b) => b.weight - a.weight)

  return { score, bucket, contributions, unfiredSignals }
}
