/**
 * Single script: load IBKR CSV dump (optional) and sync to journal.
 * - If CSV path given (CLI or IBKR_CSV env): parse and insert into ibkr_transactions (skips duplicates).
 * - Cluster Buy/Sell txns (same symbol+type, within 21 days), match to existing decisions, create
 *   "Automated from IBKR" entries for unmatched clusters, fill missing price/shares on existing actions.
 *
 * Usage: node scripts/sync-ibkr.js [path/to/transactions.csv]
 *   Or:  IBKR_CSV=path/to/file.csv node scripts/sync-ibkr.js
 *   Or:  node scripts/sync-ibkr.js   (sync from existing ibkr_transactions only)
 *
 * Requires: .env.local with Supabase URL/key and IMPORT_USER_EMAIL, IMPORT_USER_PASSWORD
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
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const importEmail = process.env.IMPORT_USER_EMAIL
const importPassword = process.env.IMPORT_USER_PASSWORD

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or anon key in .env.local')
  process.exit(1)
}
if (!importEmail || !importPassword) {
  console.error('Add IMPORT_USER_EMAIL and IMPORT_USER_PASSWORD to .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const CLUSTER_DAYS = 21
const MATCH_DAYS = 7
const TRADE_TYPES = new Set(['Buy', 'Sell'])

function companyKey(symbol) {
  if (!symbol || typeof symbol !== 'string') return ''
  return symbol.trim().toUpperCase().split(/[.:]/)[0] || symbol.trim().toUpperCase()
}

/** Parse IBKR Transaction History CSV (Header + Data lines). Returns rows { tx_date, account, description, transaction_type, symbol, quantity, price, ... } */
function parseIbkrCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/)
  const dataLines = lines.filter((l) => l.startsWith('Transaction History,Data,'))
  const rows = []
  for (const line of dataLines) {
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length < 9) continue
    const txType = parts[5]
    if (!TRADE_TYPES.has(txType)) continue
    const quantity = parts[7] !== undefined && parts[7] !== '' && parts[7] !== '-' ? parseFloat(parts[7]) : null
    const price = parts[8] !== undefined && parts[8] !== '' && parts[8] !== '-' ? parseFloat(parts[8]) : null
    rows.push({
      tx_date: parts[2],
      account: parts[3] || '',
      description: parts[4] || '',
      transaction_type: txType,
      symbol: parts[6] || '',
      quantity,
      price,
      price_currency: parts[9] || '',
      gross_amount: parts[10] !== undefined && parts[10] !== '' ? parseFloat(parts[10]) : null,
      commission: parts[11] !== undefined && parts[11] !== '' ? parseFloat(parts[11]) : null,
      net_amount: parts[12] !== undefined && parts[12] !== '' ? parseFloat(parts[12]) : null,
    })
  }
  return rows
}

function clusterTransactions(txns) {
  const byKey = new Map()
  for (const t of txns) {
    const type = t.transaction_type?.toLowerCase() === 'sell' ? 'sell' : 'buy'
    const key = `${companyKey(t.symbol)}|${type}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push({ ...t, type })
  }
  const clusters = []
  for (const [, list] of byKey) {
    list.sort((a, b) => (a.tx_date || '').localeCompare(b.tx_date || ''))
    let run = [list[0]]
    for (let i = 1; i < list.length; i++) {
      const prev = run[run.length - 1].tx_date
      const curr = list[i].tx_date
      const prevMs = prev ? new Date(prev).getTime() : 0
      const currMs = curr ? new Date(curr).getTime() : 0
      const days = (currMs - prevMs) / (24 * 60 * 60 * 1000)
      if (days <= CLUSTER_DAYS) run.push(list[i])
      else {
        clusters.push(run)
        run = [list[i]]
      }
    }
    if (run.length) clusters.push(run)
  }
  return clusters
}

function summarizeCluster(txns) {
  const first = txns[0]
  const last = txns[txns.length - 1]
  let totalQty = 0
  let weightedSum = 0
  const sym = (first.symbol || '').trim().toUpperCase()
  for (const t of txns) {
    const q = Number(t.quantity) || 0
    const p = Number(t.price) || 0
    totalQty += Math.abs(q)
    weightedSum += Math.abs(q) * p
  }
  const avgPrice = totalQty > 0 ? weightedSum / totalQty : (Number(first.price) || 0)
  const type = first.type || (first.transaction_type?.toLowerCase() === 'sell' ? 'sell' : 'buy')
  return {
    companyKey: companyKey(sym),
    symbol: sym,
    type,
    firstDate: first.tx_date || '',
    lastDate: last.tx_date || '',
    totalQty,
    avgPrice,
    count: txns.length,
    firstTxnId: first.id,
  }
}

function clusterMatchesAction(cluster, actions) {
  const ck = cluster.companyKey
  const type = cluster.type
  const clusterStart = cluster.firstDate
  const clusterEnd = cluster.lastDate
  for (const a of actions) {
    const ak = companyKey(a.ticker)
    if (ak !== ck) continue
    const at = (a.type || '').toLowerCase()
    if (at !== type) continue
    const ad = a.action_date || ''
    if (!ad) continue
    const adMs = new Date(ad).getTime()
    const startMs = new Date(clusterStart).getTime()
    const endMs = new Date(clusterEnd).getTime()
    if (adMs >= startMs - MATCH_DAYS * 86400000 && adMs <= endMs + MATCH_DAYS * 86400000) return true
  }
  return false
}

async function main() {
  const csvPath = process.argv[2] || process.env.IBKR_CSV || ''
  let userId

  console.log('Signing in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: importEmail,
    password: importPassword,
  })
  if (authError) {
    console.error('Sign-in failed:', authError.message)
    process.exit(1)
  }
  userId = authData.user.id
  console.log('User id:', userId)

  if (csvPath && fs.existsSync(csvPath)) {
    console.log('Loading IBKR dump:', csvPath)
    const rows = parseIbkrCsv(csvPath)
    console.log('Parsed', rows.length, 'Buy/Sell rows')
    const { data: existing } = await supabase
      .from('ibkr_transactions')
      .select('tx_date, symbol, transaction_type, quantity, price')
      .eq('user_id', userId)
    const keySet = new Set((existing || []).map((r) => `${r.tx_date}|${r.symbol}|${r.transaction_type}|${r.quantity}|${r.price}`))
    let inserted = 0
    for (const r of rows) {
      const key = `${r.tx_date}|${r.symbol}|${r.transaction_type}|${r.quantity}|${r.price}`
      if (keySet.has(key)) continue
      const { error } = await supabase.from('ibkr_transactions').insert({
        user_id: userId,
        tx_date: r.tx_date,
        account: r.account,
        description: r.description,
        transaction_type: r.transaction_type,
        symbol: r.symbol,
        quantity: r.quantity,
        price: r.price,
        price_currency: r.price_currency,
        gross_amount: r.gross_amount,
        commission: r.commission,
        net_amount: r.net_amount,
      })
      if (!error) {
        keySet.add(key)
        inserted++
      }
    }
    console.log('Inserted', inserted, 'new IBKR transactions')
  } else if (csvPath) {
    console.warn('CSV not found:', csvPath, '— syncing from existing DB only')
  }

  const { data: ibkrTxns, error: ibkrErr } = await supabase
    .from('ibkr_transactions')
    .select('id, tx_date, symbol, transaction_type, quantity, price')
    .eq('user_id', userId)
    .in('transaction_type', ['Buy', 'Sell'])
    .order('tx_date', { ascending: true })

  if (ibkrErr) {
    console.error('Failed to load IBKR transactions:', ibkrErr.message)
    process.exit(1)
  }
  const txns = ibkrTxns || []
  console.log('IBKR Buy/Sell in DB:', txns.length)

  const { data: actions, error: actionsErr } = await supabase
    .from('actions')
    .select('id, type, ticker, action_date, price, shares')
  if (actionsErr) {
    console.error('Failed to load actions:', actionsErr.message)
    process.exit(1)
  }
  const existingActions = actions || []
  console.log('Existing decisions:', existingActions.length)

  const clusters = clusterTransactions(txns)
  const summaries = clusters.map(summarizeCluster)
  console.log('Clusters (same symbol+type, within', CLUSTER_DAYS, 'days):', summaries.length)

  const existingEntryIds = new Set()
  const { data: existingEntries } = await supabase
    .from('entries')
    .select('entry_id')
    .eq('user_id', userId)
    .like('entry_id', 'ibkr-%')
  if (existingEntries) existingEntries.forEach((e) => existingEntryIds.add(e.entry_id))

  function findMatchingCluster(action, clusterSummaries) {
    const ck = companyKey(action.ticker)
    const type = (action.type || '').toLowerCase()
    if (type !== 'buy' && type !== 'sell') return null
    const ad = action.action_date || ''
    if (!ad) return null
    const adMs = new Date(ad).getTime()
    for (const c of clusterSummaries) {
      if (c.companyKey !== ck || c.type !== type) continue
      const startMs = new Date(c.firstDate).getTime()
      const endMs = new Date(c.lastDate).getTime()
      if (adMs >= startMs - MATCH_DAYS * 86400000 && adMs <= endMs + MATCH_DAYS * 86400000) return c
    }
    return null
  }

  let created = 0
  let skippedMatch = 0
  let skippedDup = 0
  for (const cluster of summaries) {
    if (clusterMatchesAction(cluster, existingActions)) {
      skippedMatch++
      continue
    }
    const entryId = `ibkr-${cluster.firstTxnId}`
    if (existingEntryIds.has(entryId)) {
      skippedDup++
      continue
    }
    const typeLabel = cluster.type === 'sell' ? 'Sell' : 'Buy'
    const title = `Automated: ${typeLabel} $${cluster.symbol}`
    const dateRange = cluster.firstDate === cluster.lastDate ? cluster.firstDate : `${cluster.firstDate} – ${cluster.lastDate}`
    const body = `From IBKR. ${cluster.count} transaction(s) between ${dateRange}. Total quantity: ${cluster.totalQty}. Average price: $${cluster.avgPrice.toFixed(2)}.`
    const { data: entry, error: entryErr } = await supabase
      .from('entries')
      .insert({
        user_id: userId,
        entry_id: entryId,
        date: cluster.firstDate,
        author: 'IBKR',
        tags: ['Automated', 'IBKR'],
        title_markdown: title,
        body_markdown: body,
      })
      .select('id')
      .single()

    if (entryErr) {
      if (entryErr.code === '23505') {
        existingEntryIds.add(entryId)
        skippedDup++
        continue
      }
      console.warn('Entry insert failed:', entryErr.message, cluster.symbol, cluster.firstDate)
      continue
    }
    existingEntryIds.add(entryId)
    const reason = `Automated from IBKR. ${cluster.count} txn(s), ${dateRange}.`
    const { error: actionErr } = await supabase.from('actions').insert({
      entry_id: entry.id,
      type: cluster.type,
      ticker: cluster.symbol,
      action_date: cluster.firstDate,
      price: cluster.avgPrice.toFixed(2),
      shares: cluster.totalQty,
      reason,
      notes: body.slice(0, 2000),
      raw_snippet: `IBKR ${cluster.count} txn(s)`,
    })
    if (!actionErr) {
      created++
      console.log('  +', title, `(${cluster.count} txn(s))`)
    }
  }

  let filled = 0
  for (const a of existingActions) {
    const type = (a.type || '').toLowerCase()
    if (type !== 'buy' && type !== 'sell') continue
    const needPrice = !a.price || String(a.price).trim() === ''
    const needShares = a.shares == null || Number(a.shares) === 0
    if (!needPrice && !needShares) continue
    const cluster = findMatchingCluster(a, summaries)
    if (!cluster) continue
    const updates = {}
    if (needPrice) updates.price = cluster.avgPrice.toFixed(2)
    if (needShares) updates.shares = cluster.totalQty
    const { error: upErr } = await supabase.from('actions').update(updates).eq('id', a.id)
    if (!upErr) {
      filled++
      console.log('  Filled', type, a.ticker, 'from IBKR:', Object.keys(updates).join(', '))
    }
  }
  if (filled) console.log('Filled', filled, 'existing action(s) with IBKR price/shares.')

  console.log('')
  console.log('Done. Created', created, 'automated entries+actions. Skipped (matched):', skippedMatch, '(duplicate):', skippedDup)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
