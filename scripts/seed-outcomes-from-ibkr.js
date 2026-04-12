/**
 * Seed outcomes from IBKR per-trade data (authoritative realized P&L).
 *
 * Pipeline:
 *   1. Load public/data/ibkr-activity-summary.json — requires per-trade extraction from
 *      scripts/parse-ibkr-activity-html.js (run npm run parse:ibkr first).
 *   2. For every CLOSING trade (Realized P/L ≠ 0) in all accounts, find a matching journal
 *      sell/cover action by (ticker, date ±MATCH_DAYS, quantity within 5%). Create an outcome
 *      with the exact realized P/L in the trade's local currency.
 *   3. For closing trades with no matching journal action, cluster consecutive trades and
 *      auto-create an IBKR-seeded entry + sell/cover action (same pattern as sync-ibkr-to-journal.js).
 *   4. Before inserting, delete outcomes previously seeded by this script (rows whose
 *      notes match the "IBKR seeded" marker) so re-running gives a clean replace.
 *
 * Cross-references every statement in data/private/ibkr-raw/:
 *   - Annuals.2024 + Annuals.2025 annual statements (both accounts)
 *   - MULTI Jan-Feb 2026 statement (both accounts)
 * Trades are deduplicated across overlapping statements by (accountId, symbol, dateTime, qty, price).
 *
 * **Currency note**: per-trade realized P/L is stored in its local currency (GBP for WATR,
 * CAD for SGD, USD for US, etc.). The outcome's realized_pnl is consistent with the action's
 * price currency, so per-trade return % is accurate. Aggregate sums across mixed currencies
 * are nominal (not FX-converted) — this matches how the schema already works.
 *
 * Requires: .env.local with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * Run: npm run seed:outcomes-from-ibkr
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.error('Missing Supabase URL in .env.local')
  process.exit(1)
}

const key = serviceKey || anonKey
if (!key) {
  console.error('Missing Supabase key in .env.local')
  process.exit(1)
}
if (!serviceKey) {
  console.warn('⚠️  Using anon key — RLS may block inserts/deletes. Set SUPABASE_SERVICE_ROLE_KEY for seeding.')
}

const supabase = createClient(supabaseUrl, key)

// ─── Config ────────────────────────────────────────────────────────────────
const SUMMARY_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'ibkr-activity-summary.json')
const MATCH_DAYS = 3
const QTY_TOLERANCE = 0.05 // 5% of quantity
const SEEDED_MARKER = '[ibkr-seeded]' // notes field tag for rows we own (new format)
// Legacy notes patterns from earlier seeder versions — we treat these as "our rows"
// so re-running this script cleanly replaces them with accurate per-trade data.
const LEGACY_SEEDED_MARKERS = [
  /^Seeded from IBKR activity/i,
  /^Seeded from IBKR \(WATR\)/i,
  /Seeded from IBKR/i,
]
const DRY_RUN = process.argv.includes('--dry-run')
const NO_AUTO_CREATE = process.argv.includes('--no-auto-create')

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Base symbol without exchange suffix (CSU:TO / CSU.TO → CSU). Keeps options
 * like "APP   260117P00200000" distinct — options contracts aren't stripped
 * because their "symbol" already embeds strike/expiry.
 */
function companyKey(ticker) {
  if (!ticker || typeof ticker !== 'string') return ''
  const t = ticker.trim().toUpperCase()
  // Options contracts contain spaces + numeric strikes — don't split those.
  if (/\s\d/.test(t)) return t
  return t.split(/[.:]/)[0] || t
}

function loadSummary() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error('IBKR summary not found at', SUMMARY_PATH)
    console.error('Run: npm run parse:ibkr (HTML files must be in data/private/ibkr-raw/)')
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'))
}

/** Convert "2026-01-02, 11:16:34" to ISO date "2026-01-02". */
function toDateOnly(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return ''
  return dateTimeStr.slice(0, 10)
}

/**
 * Given a closing trade, decide its journal action type:
 *   - Quantity < 0 (sell) → 'sell' (closing long)
 *   - Quantity > 0 (buy)  → 'cover' (closing short)
 * This is only called for trades with realizedPL ≠ 0 (i.e. closing trades).
 */
function actionTypeForClosingTrade(trade) {
  const q = Number(trade.quantity) || 0
  if (q < 0) return 'sell'
  if (q > 0) return 'cover'
  return 'sell'
}

/**
 * Find the best-matching journal action for a closing trade.
 * Match criteria: same ticker (company key), same action type, date within MATCH_DAYS,
 * quantity within QTY_TOLERANCE. Returns null if no match.
 */
function findMatchingAction(trade, actions) {
  const tradeDate = toDateOnly(trade.dateTime)
  if (!tradeDate) return null
  const tradeTs = new Date(tradeDate).getTime()
  const tradeKey = companyKey(trade.symbol)
  const tradeType = actionTypeForClosingTrade(trade)
  const absTradeQty = Math.abs(Number(trade.quantity) || 0)

  let best = null
  let bestDelta = Infinity
  for (const a of actions) {
    const aKey = companyKey(a.ticker)
    if (aKey !== tradeKey) continue
    const aType = (a.type || '').toLowerCase()
    // Accept sell / cover / trim as "closing long" family; short stays a separate group.
    if (tradeType === 'sell' && aType !== 'sell' && aType !== 'trim') continue
    if (tradeType === 'cover' && aType !== 'cover') continue
    const aDate = a.action_date || ''
    if (!aDate) continue
    const aTs = new Date(aDate).getTime()
    const dayDelta = Math.abs(tradeTs - aTs) / 86400000
    if (dayDelta > MATCH_DAYS) continue
    // Quantity tolerance — skip if both sides have quantities and they're far apart.
    if (a.shares != null && absTradeQty > 0) {
      const qtyDelta = Math.abs(Number(a.shares) - absTradeQty) / Math.max(Number(a.shares), absTradeQty)
      if (qtyDelta > QTY_TOLERANCE + 0.001) continue
    }
    if (dayDelta < bestDelta) {
      best = a
      bestDelta = dayDelta
    }
  }
  return best
}

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * Build a map from (assetClass, symbol) → realizedTotal in USD base, aggregated
 * across all statements and accounts. The FIFO Performance Summary table in IBKR
 * Activity Statements reports these totals in the account's base currency (USD).
 *
 * This is the ground truth we use to FX-convert per-trade realized P&L. Each
 * trade's USD P&L = trade.realizedPL × (symbolUSDTotal / sumLocalRawPL). Since
 * all trades for a single (assetClass, symbol) are in the same local currency,
 * this ratio implicitly encodes the correct FX rate.
 */
function buildFifoTotalsUSD(summary) {
  const map = new Map() // key `${assetClass}|${symbol}` → sum USD
  for (const st of summary.statements || []) {
    for (const acc of st.accounts || []) {
      for (const row of acc.fifoRows || acc.realizedUnrealizedStocks || []) {
        const ac = row.assetClass || 'Stocks'
        const sym = (row.symbol || '').trim()
        const rt = Number(row.realizedTotal)
        if (!sym || !Number.isFinite(rt)) continue
        const key = `${ac}|${sym}`
        map.set(key, (map.get(key) || 0) + rt)
      }
    }
  }
  return map
}

/**
 * For each closing trade, compute its USD P&L by ratio-to-FIFO-total. Trades without
 * a FIFO entry (e.g. bond coupons, forecast contracts) fall back to a hardcoded
 * period-average FX rate per currency. USD trades always round-trip to themselves.
 */
const FALLBACK_FX_RATE_USD = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  CHF: 1.12,
  AUD: 0.66,
  JPY: 0.0066,
  PLN: 0.25,
  SEK: 0.096,
  NOK: 0.093,
  DKK: 0.145,
}

function convertTradesToUsd(trades, fifoTotalsUSD) {
  // Pre-compute sum of local raw P&L per (assetClass, symbol)
  const localSum = new Map()
  for (const t of trades) {
    const rpl = Number(t.realizedPL)
    if (!Number.isFinite(rpl) || rpl === 0) continue
    const key = `${t.assetClass || 'Stocks'}|${t.symbol}`
    localSum.set(key, (localSum.get(key) || 0) + rpl)
  }

  const result = []
  let fallbackCount = 0
  let ratioCount = 0
  for (const t of trades) {
    const rpl = Number(t.realizedPL)
    if (!Number.isFinite(rpl) || rpl === 0) {
      result.push({ ...t, realizedPLUsd: 0 })
      continue
    }
    const key = `${t.assetClass || 'Stocks'}|${t.symbol}`
    const fifoUsd = fifoTotalsUSD.get(key)
    const localTotal = localSum.get(key)
    let usd
    if (
      fifoUsd != null &&
      Number.isFinite(fifoUsd) &&
      localTotal != null &&
      Number.isFinite(localTotal) &&
      Math.abs(localTotal) > 1e-9
    ) {
      // Ratio method — implicit FX rate from FIFO table
      usd = rpl * (fifoUsd / localTotal)
      ratioCount += 1
    } else {
      // Fallback: hardcoded period-average FX rate
      const fx = FALLBACK_FX_RATE_USD[(t.currency || 'USD').toUpperCase()] ?? 1.0
      usd = rpl * fx
      fallbackCount += 1
    }
    result.push({ ...t, realizedPLUsd: Math.round(usd * 100) / 100 })
  }
  return { trades: result, ratioCount, fallbackCount }
}

async function main() {
  const summary = loadSummary()
  const trades = summary.trades || []
  if (trades.length === 0) {
    console.error('Summary has no per-trade data. Re-run parse:ibkr after upgrading the parser.')
    process.exit(1)
  }
  const fifoTotalsUSD = buildFifoTotalsUSD(summary)
  const { trades: tradesWithUsd, ratioCount, fallbackCount } = convertTradesToUsd(trades, fifoTotalsUSD)
  const closingTrades = tradesWithUsd.filter((t) => t.realizedPL != null && t.realizedPL !== 0)
  console.log(`Loaded ${trades.length} total trades (${closingTrades.length} closing)`)
  console.log(`USD conversion: ${ratioCount} via FIFO-ratio, ${fallbackCount} via fallback FX rates`)
  const totalUsd = closingTrades.reduce((s, t) => s + (t.realizedPLUsd || 0), 0)
  console.log(`Total realized P&L across all closing trades (USD): $${totalUsd.toFixed(2)}`)

  // Load ALL existing journal actions and outcomes (no user_id filter; service role bypasses RLS)
  const { data: allActions, error: actionsErr } = await supabase
    .from('actions')
    .select('id, entry_id, type, ticker, action_date, price, currency, shares, notes')
  if (actionsErr) {
    console.error('Failed to load actions:', actionsErr.message)
    process.exit(1)
  }
  const { data: allOutcomes, error: outcomesErr } = await supabase
    .from('outcomes')
    .select('id, action_id, notes, realized_pnl')
  if (outcomesErr) {
    console.error('Failed to load outcomes:', outcomesErr.message)
    process.exit(1)
  }
  console.log(`Found ${allActions.length} journal actions and ${allOutcomes.length} outcomes in DB`)

  // Identify the entry user_id for auto-created entries by reading the first action's entry
  let autoUserId = null
  if (!NO_AUTO_CREATE && allActions.length > 0) {
    const firstEntryId = allActions[0].entry_id
    const { data: firstEntry } = await supabase.from('entries').select('user_id').eq('id', firstEntryId).single()
    autoUserId = firstEntry?.user_id ?? null
    if (!autoUserId) {
      console.warn('Could not determine user_id for auto-created entries — auto-create will be skipped.')
    }
  }

  // Delete previously seeded outcomes so re-running replaces them cleanly.
  // This includes both the new SEEDED_MARKER rows and legacy patterns from earlier seeder
  // versions (the "evenly distributed company total" rows that produced the wrong sums).
  const isSeeded = (notes) => {
    if (typeof notes !== 'string') return false
    if (notes.includes(SEEDED_MARKER)) return true
    return LEGACY_SEEDED_MARKERS.some((re) => re.test(notes))
  }
  const seededOutcomeIds = allOutcomes.filter((o) => isSeeded(o.notes)).map((o) => o.id)
  console.log(`Previously IBKR-seeded outcomes: ${seededOutcomeIds.length}`)
  if (seededOutcomeIds.length > 0 && !DRY_RUN) {
    const { error: delErr } = await supabase.from('outcomes').delete().in('id', seededOutcomeIds)
    if (delErr) {
      console.error('Failed to delete old seeded outcomes:', delErr.message)
      process.exit(1)
    }
    console.log(`  ✓ Deleted ${seededOutcomeIds.length} stale seeded outcomes`)
  }

  // Build a filtered actions list excluding the ones whose outcomes were just deleted
  const remainingOutcomeActionIds = new Set(
    allOutcomes.filter((o) => !seededOutcomeIds.includes(o.id)).map((o) => o.action_id),
  )

  const matched = [] // { trade, action, action_id }
  const unmatchedTrades = [] // closing trades with no matching action
  const updatedActions = [] // actions whose price/shares/currency got filled in from trade data

  for (const trade of closingTrades) {
    const match = findMatchingAction(trade, allActions)
    if (match) {
      matched.push({ trade, action: match })
      // Skip outcome creation if this action already has a non-seeded outcome (preserve user data).
      // It will be handled below.
    } else {
      unmatchedTrades.push(trade)
    }
  }

  console.log()
  console.log('Matching results:')
  console.log(`  Matched to existing action: ${matched.length}`)
  console.log(`  Unmatched (no journal record): ${unmatchedTrades.length}`)
  if (matched.length === 0 && unmatchedTrades.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // Aggregate by action_id — a single journal "Sell $WATR" may correspond to multiple
  // IBKR lots on the same day. Sum their USD-converted realized P&L so the outcome
  // reflects the whole sell and the analytics total is currency-consistent.
  const outcomeByActionId = new Map() // action_id → { action, realized_pnl_usd, count, currency, firstDate, sources[] }
  for (const m of matched) {
    const key = m.action.id
    if (!outcomeByActionId.has(key)) {
      outcomeByActionId.set(key, {
        action: m.action,
        realized_pnl: 0,
        count: 0,
        currency: m.trade.currency,
        firstDate: toDateOnly(m.trade.dateTime),
        sources: [],
      })
    }
    const agg = outcomeByActionId.get(key)
    agg.realized_pnl += m.trade.realizedPLUsd || 0
    agg.count += 1
    if ((agg.firstDate || '') > toDateOnly(m.trade.dateTime)) agg.firstDate = toDateOnly(m.trade.dateTime)
    agg.sources.push(
      `${m.trade.accountId}·${toDateOnly(m.trade.dateTime)}·${(m.trade.realizedPLUsd || 0).toFixed(2)}USD(from ${(m.trade.realizedPL || 0).toFixed(2)}${m.trade.currency || ''})`,
    )
  }

  // Build outcome insert payloads for actions that don't already have a manually-written outcome.
  // Actions whose outcomes are preserved (not seeded, not deleted above) are skipped so we
  // never clobber user-written process scores or memos.
  const outcomeInserts = []
  let skippedExisting = 0
  for (const [actionId, agg] of outcomeByActionId) {
    if (remainingOutcomeActionIds.has(actionId)) {
      skippedExisting += 1
      continue
    }
    const round = (n) => Math.round(n * 100) / 100
    outcomeInserts.push({
      action_id: actionId,
      realized_pnl: round(agg.realized_pnl),
      outcome_date: agg.firstDate || new Date().toISOString().slice(0, 10),
      notes: `${SEEDED_MARKER} ${agg.count} IBKR lot(s) · ${agg.sources.join(' | ')}`,
    })
  }
  console.log(`  Outcome inserts prepared: ${outcomeInserts.length} (skipped ${skippedExisting} actions with existing manual outcomes)`)

  // Update actions whose currency or price/shares are missing/wrong.
  for (const [actionId, agg] of outcomeByActionId) {
    const a = agg.action
    const updates = {}
    // Only update if the field is empty or markedly different — don't overwrite good data.
    const currentCurrency = (a.currency || '').toUpperCase()
    const tradeCurrency = (agg.currency || '').toUpperCase()
    if (tradeCurrency && !currentCurrency) updates.currency = tradeCurrency
    if (Object.keys(updates).length > 0) updatedActions.push({ id: actionId, updates })
  }
  console.log(`  Action updates queued (currency fill-in): ${updatedActions.length}`)

  if (DRY_RUN) {
    console.log()
    console.log('DRY RUN — no writes. Sample of prepared outcomes:')
    for (const row of outcomeInserts.slice(0, 5)) console.log('  ', row)
    return
  }

  // Apply currency updates first.
  let actionsUpdated = 0
  for (const u of updatedActions) {
    const { error } = await supabase.from('actions').update(u.updates).eq('id', u.id)
    if (!error) actionsUpdated += 1
  }
  if (actionsUpdated > 0) console.log(`  ✓ Updated ${actionsUpdated} actions (currency fill)`)

  // Insert outcomes in batches of 100.
  let outcomesInserted = 0
  const BATCH = 100
  for (let i = 0; i < outcomeInserts.length; i += BATCH) {
    const batch = outcomeInserts.slice(i, i + BATCH)
    const { data, error } = await supabase.from('outcomes').insert(batch).select('id')
    if (error) {
      console.error('Outcome insert failed for batch', i, ':', error.message)
    } else {
      outcomesInserted += data?.length ?? 0
    }
  }
  console.log(`  ✓ Inserted ${outcomesInserted} outcomes from matched trades`)

  // ─── Auto-create entries for unmatched closing trades ─────────────────
  if (NO_AUTO_CREATE || unmatchedTrades.length === 0 || !autoUserId) {
    if (unmatchedTrades.length > 0 && NO_AUTO_CREATE) {
      console.log(`  Skipped ${unmatchedTrades.length} unmatched trades (--no-auto-create)`)
    }
    summarize(outcomesInserted, actionsUpdated, unmatchedTrades.length, 0)
    return
  }

  // Group unmatched trades by (accountId, symbol, date, type) into "virtual sells".
  // A single journal "Sell $X" might correspond to many IBKR lots; we create ONE entry per group.
  const groups = new Map()
  for (const t of unmatchedTrades) {
    const actType = actionTypeForClosingTrade(t)
    const date = toDateOnly(t.dateTime)
    const groupKey = `${t.accountId}|${companyKey(t.symbol)}|${date}|${actType}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        accountId: t.accountId,
        ticker: t.symbol,
        date,
        type: actType,
        currency: t.currency,
        assetClass: t.assetClass,
        trades: [],
        realizedPL: 0,
        realizedPLUsd: 0,
        totalQty: 0,
        weightedPriceSum: 0,
      })
    }
    const g = groups.get(groupKey)
    g.trades.push(t)
    g.realizedPL += t.realizedPL
    g.realizedPLUsd += t.realizedPLUsd || 0
    const qty = Math.abs(Number(t.quantity) || 0)
    g.totalQty += qty
    g.weightedPriceSum += qty * (Number(t.tradePrice) || 0)
  }
  console.log(`  Auto-creating ${groups.size} entries for unmatched closing trades…`)

  let autoCreated = 0
  let autoOutcomes = 0
  for (const [, g] of groups) {
    const round = (n) => Math.round(n * 100) / 100
    const avgPrice = g.totalQty > 0 ? g.weightedPriceSum / g.totalQty : 0
    const typeLabel = g.type === 'cover' ? 'Cover' : 'Sell'
    const title = `Automated: ${typeLabel} $${companyKey(g.ticker)}`
    const body = `From IBKR (${g.accountId}). ${g.trades.length} lot(s) on ${g.date}. Total qty: ${g.totalQty}. Avg price: ${avgPrice.toFixed(4)} ${g.currency}. Realized P/L: ${g.realizedPL.toFixed(2)} ${g.currency}.`
    const entryId = `ibkr-auto-${g.accountId}-${g.date}-${companyKey(g.ticker).replace(/\s+/g, '_')}-${g.type}`

    let entry
    const { data: inserted, error: entryErr } = await supabase
      .from('entries')
      .insert({
        user_id: autoUserId,
        entry_id: entryId,
        date: g.date,
        author: 'IBKR',
        tags: ['Automated', 'IBKR'],
        title_markdown: title,
        body_markdown: body,
      })
      .select('id')
      .single()
    if (entryErr) {
      if (entryErr.code === '23505') {
        // Entry already exists (previous run). Look it up and reuse.
        const { data: existing } = await supabase
          .from('entries')
          .select('id')
          .eq('user_id', autoUserId)
          .eq('entry_id', entryId)
          .single()
        if (existing) {
          entry = existing
        } else {
          console.warn('Entry 23505 but lookup failed:', entryId)
          continue
        }
      } else {
        console.warn('Entry insert failed:', entryErr.message, entryId)
        continue
      }
    } else {
      entry = inserted
    }
    // Skip if this entry already has an action of the right type (from a prior run).
    const { data: existingActions } = await supabase
      .from('actions')
      .select('id, type')
      .eq('entry_id', entry.id)
    if (existingActions && existingActions.some((a) => (a.type || '').toLowerCase() === g.type)) {
      continue
    }

    const { data: action, error: actionErr } = await supabase
      .from('actions')
      .insert({
        entry_id: entry.id,
        type: g.type,
        ticker: companyKey(g.ticker),
        company_name: null,
        action_date: g.date,
        price: avgPrice.toFixed(4),
        currency: g.currency || null,
        shares: g.totalQty,
        reason: 'Automated from IBKR',
        notes: body.slice(0, 2000),
        raw_snippet: `IBKR ${g.trades.length} lot(s) · ${g.accountId}`,
      })
      .select('id')
      .single()
    if (actionErr) {
      console.warn('Action insert failed:', actionErr.message, entryId)
      continue
    }
    autoCreated += 1

    const { error: outcomeErr } = await supabase.from('outcomes').insert({
      action_id: action.id,
      realized_pnl: round(g.realizedPLUsd),
      outcome_date: g.date,
      notes: `${SEEDED_MARKER} Auto from IBKR · ${g.trades.length} lot(s) · ${g.accountId} · ${g.realizedPL.toFixed(2)}${g.currency || ''} → $${g.realizedPLUsd.toFixed(2)}`,
    })
    if (!outcomeErr) autoOutcomes += 1
  }

  console.log(`  ✓ Auto-created ${autoCreated} entries + ${autoOutcomes} outcomes`)
  summarize(outcomesInserted, actionsUpdated, 0, autoCreated)
}

function summarize(matchedOutcomes, actionsUpdated, skippedUnmatched, autoCreated) {
  console.log()
  console.log('════════════════════════════════════')
  console.log('IBKR OUTCOMES SEEDING COMPLETE')
  console.log('════════════════════════════════════')
  console.log(`  Outcomes from matched trades:      ${matchedOutcomes}`)
  console.log(`  Actions updated (currency):        ${actionsUpdated}`)
  console.log(`  Auto-created entries+outcomes:     ${autoCreated}`)
  if (skippedUnmatched > 0) console.log(`  Unmatched trades skipped:          ${skippedUnmatched}`)
  console.log()
  console.log('Refresh the Analytics dashboard to see updated sums.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
