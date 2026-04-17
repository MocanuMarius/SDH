#!/usr/bin/env node
/**
 * One-shot: parse legacy markdown decision blocks out of `entries.body_markdown`
 * and insert matching `actions` rows so they appear in Trades / Timeline / Ticker
 * pages. Idempotent — skips a row if a matching (entry, type, ticker, date)
 * action already exists.
 *
 * Run locally:
 *   node scripts/promote-legacy-decisions.js
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL +
 * VITE_SUPABASE_ANON_KEY for a dry-run scoped to your own user) from .env.local.
 *
 * Required because the entry editor used to splice decisions as markdown into
 * the body without creating structured `actions` rows. Modern entries no
 * longer do this; this script cleans up everything that pre-dated the fix.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read env from .env.local manually so this works without dotenv.
const env = {}
try {
  for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
} catch {}

const url = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = env.VITE_SUPABASE_ANON_KEY
const key = serviceKey || anonKey
if (!url || !key) {
  console.error('Missing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_* fallback)')
  process.exit(1)
}
if (!serviceKey) console.warn('No service role key — running scoped to current anon RLS.')

const supabase = createClient(url, key, { auth: { persistSession: false } })

const VALID_TYPES = new Set([
  'buy','sell','short','cover','trim','hold','pass','speculate','add_more','research','watchlist',
])

function normaliseType(t) {
  const lower = t.toLowerCase()
  if (lower === 'addmore' || lower === 'add') return 'add_more'
  return VALID_TYPES.has(lower) ? lower : null
}

function toIso(m, d, y) {
  const yy = y.length === 2 ? (Number(y) > 50 ? '19' : '20') + y : y
  return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseExtras(rest) {
  const sharesMatch = rest.match(/(\d+(?:\.\d+)?)\s*shares?\s*@\s*([A-Za-z]{0,4}\$?)([0-9.,]+)/i)
  if (sharesMatch) {
    return {
      shares: Number(sharesMatch[1]),
      currency: sharesMatch[2].replace('$', '').trim() || 'USD',
      price: sharesMatch[3],
    }
  }
  const priceMatch = rest.match(/Price:\s*([A-Za-z]{0,4}\$?)([0-9.,]+)/i)
  if (priceMatch) {
    return {
      shares: null,
      currency: priceMatch[1].replace('$', '').trim() || 'USD',
      price: priceMatch[2],
    }
  }
  return { shares: null, currency: null, price: '' }
}

function extractCompany(rest) {
  const dashIdx = rest.indexOf('-')
  if (dashIdx < 0) return null
  const after = rest.slice(dashIdx + 1).trim()
  const stop = after.search(/\d+\s*shares?\s*@|Price:/i)
  return (stop >= 0 ? after.slice(0, stop) : after).trim() || null
}

const decisionRe =
  /^(\w+)\s+Decision\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+\$([A-Z0-9.:]+)\s*-?\s*([^\n]*)/gim

async function main() {
  const { data: entries, error } = await supabase
    .from('entries')
    .select('id, user_id, body_markdown, tags, author')
  if (error) throw error

  const manual = (entries || []).filter(
    (e) =>
      !(e.tags || []).includes('Automated') &&
      !(e.tags || []).includes('IBKR') &&
      e.author !== 'IBKR',
  )

  const { data: existing } = await supabase
    .from('actions')
    .select('entry_id, type, ticker, action_date')
  const seen = new Set(
    (existing || []).map(
      (a) => `${a.entry_id}|${a.type}|${(a.ticker || '').toUpperCase()}|${a.action_date}`,
    ),
  )

  const inserts = []
  const skipped = []
  for (const entry of manual) {
    if (!entry.body_markdown) continue
    for (const m of entry.body_markdown.matchAll(decisionRe)) {
      const [, rawType, mm, dd, yy, ticker, rest] = m
      const type = normaliseType(rawType)
      if (!type) {
        skipped.push({ entry: entry.id, reason: 'unknown type ' + rawType })
        continue
      }
      const action_date = toIso(mm, dd, yy)
      const key = `${entry.id}|${type}|${ticker.toUpperCase()}|${action_date}`
      if (seen.has(key)) {
        skipped.push({ entry: entry.id, reason: 'already exists' })
        continue
      }
      seen.add(key)
      const { shares, currency, price } = parseExtras(rest)
      inserts.push({
        user_id: entry.user_id,
        entry_id: entry.id,
        type,
        ticker: ticker.toUpperCase(),
        company_name: extractCompany(rest),
        action_date,
        price: price || '',
        currency,
        shares,
        reason: '',
        notes: '',
        raw_snippet: m[0],
      })
    }
  }

  console.log(`Manual entries scanned: ${manual.length}`)
  console.log(`Decisions to insert:    ${inserts.length}`)
  console.log(`Skipped (dupes etc.):   ${skipped.length}`)

  if (inserts.length === 0) return

  const { data: inserted, error: insertErr } = await supabase
    .from('actions')
    .insert(inserts)
    .select('id')
  if (insertErr) throw insertErr

  console.log(`Inserted ${inserted?.length ?? 0} actions.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
