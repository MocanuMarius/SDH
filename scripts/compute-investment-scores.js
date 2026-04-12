/**
 * Backfill investment_score on every entry in the DB.
 *
 * For each entry:
 *   1. Load its linked actions, predictions, and earliest outcome.
 *   2. If any action is an option, parse the symbol (strike, expiry) from the ticker,
 *      compute DTE at open, and fetch the historical underlying price at the open date
 *      from the chart API proxy so we can compute moneyness.
 *   3. Pass all of this into computeInvestmentScore and write the result to
 *      entries.investment_score (investment_score_override is left alone).
 *
 * Idempotent — rerunning only updates entries whose computed score has changed.
 *
 * Run: node scripts/compute-investment-scores.js
 * Options:
 *   --dry-run        don't write anything
 *   --limit=N        only process the first N entries (useful for testing)
 *   --no-fetch       skip the historical price fetch (moneyness signal will be null)
 *
 * Requires: .env.local with Supabase URL + SERVICE_ROLE_KEY.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  computeInvestmentScore,
  parseOptionSymbol,
  computeDteAtOpen,
  computeMoneyness,
  isLeap,
} from './lib/investmentScore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!supabaseUrl || !(serviceKey || anonKey)) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey || anonKey)

// CLI flags
const DRY_RUN = process.argv.includes('--dry-run')
const NO_FETCH = process.argv.includes('--no-fetch')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

// Chart API — the dev server runs /api/quote on 5173 (or user can set CHART_API_BASE)
const CHART_API_BASE = process.env.CHART_API_BASE || 'http://localhost:5173'

/**
 * Fetch historical close prices for a symbol (entire 5y window) once, then reuse.
 * Keyed per symbol — callers pass the trade date and we pick the closest prior bar.
 */
const seriesCache = new Map() // symbol -> { dates: string[], prices: number[] } | null
async function loadSeriesOnce(symbol) {
  if (NO_FETCH) return null
  if (seriesCache.has(symbol)) return seriesCache.get(symbol)
  try {
    const url = `${CHART_API_BASE}/api/chart?symbol=${encodeURIComponent(symbol)}&range=5y`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      seriesCache.set(symbol, null)
      return null
    }
    const data = await res.json()
    if (!Array.isArray(data?.dates) || !Array.isArray(data?.prices) || data.dates.length === 0) {
      seriesCache.set(symbol, null)
      return null
    }
    seriesCache.set(symbol, { dates: data.dates, prices: data.prices })
    return seriesCache.get(symbol)
  } catch {
    seriesCache.set(symbol, null)
    return null
  }
}

async function fetchUnderlyingPriceAt(symbol, isoDate) {
  const series = await loadSeriesOnce(symbol)
  if (!series) return null
  let matchIdx = -1
  for (let i = 0; i < series.dates.length; i++) {
    if (series.dates[i] <= isoDate) matchIdx = i
    else break
  }
  if (matchIdx < 0) return null
  const p = Number(series.prices[matchIdx])
  return Number.isFinite(p) ? p : null
}

/**
 * Given a journal action whose ticker looks like an option symbol, return the
 * parsed option data + moneyness at open (if the underlying price could be fetched).
 * Returns null when parsing fails.
 */
async function buildOptionData(action) {
  const parsed = parseOptionSymbol(action.ticker)
  if (!parsed) return null
  const dteAtOpen = computeDteAtOpen(action.action_date, parsed.expiry)
  let moneynessAtOpen = null
  if (dteAtOpen != null && dteAtOpen > 0) {
    const underlyingPrice = await fetchUnderlyingPriceAt(parsed.underlying, action.action_date)
    if (underlyingPrice != null) {
      moneynessAtOpen = computeMoneyness(parsed.strike, underlyingPrice)
    }
  }
  return { dteAtOpen, moneynessAtOpen, isLeap: isLeap(dteAtOpen) }
}

/**
 * Detect whether the action is an option by shape of the ticker (parser succeeds)
 * and return the full action-for-scoring payload.
 */
async function enrichAction(action) {
  const optionData = await buildOptionData(action)
  return {
    type: action.type,
    action_date: action.action_date,
    kill_criteria: action.kill_criteria,
    pre_mortem_text: action.pre_mortem_text,
    raw_snippet: action.raw_snippet,
    notes: action.notes,
    assetClass: optionData ? 'Equity and Index Options' : 'Stocks',
    optionData,
  }
}

async function main() {
  console.log('Loading entries, actions, predictions, outcomes…')
  const { data: entries, error: entriesErr } = await supabase
    .from('entries')
    .select('id, body_markdown, tags, investment_score, investment_score_override')
    .order('date', { ascending: false })
    .limit(LIMIT || 10_000)
  if (entriesErr) {
    console.error('Failed to load entries:', entriesErr.message)
    process.exit(1)
  }
  // Supabase default response limit is 1000 rows — raise it explicitly so we
  // don't silently drop actions on a large journal.
  const { data: actions, error: actionsErr } = await supabase
    .from('actions')
    .select('id, entry_id, type, ticker, action_date, kill_criteria, pre_mortem_text, raw_snippet, notes')
    .range(0, 9999)
  if (actionsErr) {
    console.error('Failed to load actions:', actionsErr.message)
    process.exit(1)
  }
  const { data: predictions, error: predErr } = await supabase
    .from('entry_predictions')
    .select('entry_id, end_date, created_at, sub_skill')
    .range(0, 9999)
  if (predErr) {
    console.error('Failed to load predictions:', predErr.message)
    process.exit(1)
  }
  const { data: outcomes, error: outErr } = await supabase
    .from('outcomes')
    .select('action_id, outcome_date')
    .range(0, 9999)
  if (outErr) {
    console.error('Failed to load outcomes:', outErr.message)
    process.exit(1)
  }
  console.log(`Loaded ${actions.length} actions, ${predictions.length} predictions, ${outcomes.length} outcomes`)

  const actionsByEntryId = new Map()
  for (const a of actions || []) {
    if (!actionsByEntryId.has(a.entry_id)) actionsByEntryId.set(a.entry_id, [])
    actionsByEntryId.get(a.entry_id).push(a)
  }
  const predictionsByEntryId = new Map()
  for (const p of predictions || []) {
    if (!predictionsByEntryId.has(p.entry_id)) predictionsByEntryId.set(p.entry_id, [])
    predictionsByEntryId.get(p.entry_id).push(p)
  }
  const outcomeByActionId = new Map()
  for (const o of outcomes || []) outcomeByActionId.set(o.action_id, o)

  console.log(`Processing ${entries.length} entries…`)

  let computedCount = 0
  let changedCount = 0
  let optionCount = 0
  let fetchAttempts = 0
  const bucketCounts = { Spec: 0, Mixed: 0, Invest: 0 }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const rawActions = actionsByEntryId.get(entry.id) || []
    const enrichedActions = []
    for (const a of rawActions) {
      const enriched = await enrichAction(a)
      if (enriched.optionData) {
        optionCount += 1
        if (!NO_FETCH && enriched.optionData.moneynessAtOpen != null) fetchAttempts += 1
      }
      enrichedActions.push(enriched)
    }
    // Earliest outcome across actions (for quick-flip signal)
    let earliestOutcome = null
    for (const a of rawActions) {
      const o = outcomeByActionId.get(a.id)
      if (!o?.outcome_date) continue
      if (!earliestOutcome || o.outcome_date < earliestOutcome.outcome_date) earliestOutcome = o
    }

    const result = computeInvestmentScore({
      entry: { body_markdown: entry.body_markdown, tags: entry.tags },
      actions: enrichedActions,
      predictions: predictionsByEntryId.get(entry.id) || [],
      earliestOutcome,
    })

    computedCount += 1
    bucketCounts[result.bucket] += 1

    if (entry.investment_score !== result.score) {
      changedCount += 1
      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from('entries')
          .update({ investment_score: result.score })
          .eq('id', entry.id)
        if (upErr) {
          console.warn(`  Update failed for ${entry.id}: ${upErr.message}`)
        }
      }
    }
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${entries.length}`)
  }

  console.log()
  console.log('════════════════════════════════════')
  console.log('INVESTMENT SCORE BACKFILL COMPLETE')
  console.log('════════════════════════════════════')
  console.log(`  Entries processed:      ${computedCount}`)
  console.log(`  Entries with changes:   ${changedCount}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)
  console.log(`  Option actions seen:    ${optionCount}`)
  console.log(`  Successful price fetches: ${fetchAttempts}`)
  console.log()
  console.log('Bucket distribution:')
  console.log(`  Spec     (<30):  ${bucketCounts.Spec}`)
  console.log(`  Mixed (30–70):   ${bucketCounts.Mixed}`)
  console.log(`  Invest  (≥70):   ${bucketCounts.Invest}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
