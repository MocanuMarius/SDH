/**
 * Unite IBKR transactions with journal decisions:
 * - Cluster consecutive Buy/Sell txns (same symbol, same type, within 21 days) into "decisions"
 * - Skip clusters that already match an existing journal action (same company, type, date near)
 * - Create "Automated from IBKR" entries + actions for unmatched clusters (tagged, no duplication)
 *
 * Requires: .env.local with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, IMPORT_USER_EMAIL, IMPORT_USER_PASSWORD
 * Run: npm run sync:ibkr-journal
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  console.error('Add one of: VITE_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_URL')
  console.error('And one of: VITE_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_ANON_KEY')
  process.exit(1)
}
if (!importEmail || !importPassword) {
  console.error('Add IMPORT_USER_EMAIL and IMPORT_USER_PASSWORD to .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const CLUSTER_DAYS = 21
const MATCH_DAYS = 7

function companyKey(symbol) {
  if (!symbol || typeof symbol !== 'string') return ''
  return symbol.trim().toUpperCase().split(/[.:]/)[0] || symbol.trim().toUpperCase()
}

/** Group txns into clusters: same companyKey + type, consecutive within CLUSTER_DAYS */
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
      if (days <= CLUSTER_DAYS) {
        run.push(list[i])
      } else {
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
  const firstDate = first.tx_date || ''
  const lastDate = last.tx_date || ''
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
    firstDate,
    lastDate,
    totalQty,
    avgPrice,
    count: txns.length,
    firstTxnId: first.id,
  }
}

/** True if some action matches this cluster (same company, type, date within MATCH_DAYS) */
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
  console.log('Signing in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: importEmail,
    password: importPassword,
  })
  if (authError) {
    console.error('Sign-in failed:', authError.message)
    process.exit(1)
  }
  const userId = authData.user.id
  console.log('User id:', userId)

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
  console.log('IBKR Buy/Sell transactions:', txns.length)

  const { data: actions, error: actionsErr } = await supabase
    .from('actions')
    .select('id, type, ticker, action_date, price, shares')
  if (actionsErr) {
    console.error('Failed to load actions:', actionsErr.message)
    process.exit(1)
  }
  const existingActions = actions || []
  console.log('Existing journal actions:', existingActions.length)

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

  /** Find a cluster that matches this action (same company, type, date near) */
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
    const dateRange =
      cluster.firstDate === cluster.lastDate
        ? cluster.firstDate
        : `${cluster.firstDate} – ${cluster.lastDate}`
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
    if (actionErr) {
      console.warn('Action insert failed:', actionErr.message)
      continue
    }
    created++
    console.log('  +', title, `(${cluster.count} txn(s))`)
  }

  // Phase 2: fill in missing price/shares on existing journal actions from matching IBKR clusters
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
  console.log('Done. Created', created, 'automated entries+actions.')
  console.log('Skipped (already matched to journal):', skippedMatch)
  console.log('Skipped (duplicate entry_id):', skippedDup)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
