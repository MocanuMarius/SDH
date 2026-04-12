/**
 * One-time import: Journalytic entries (+ parsed actions) and IBKR transactions.
 * Requires: .env.local with Supabase URL/key and IMPORT_USER_EMAIL, IMPORT_USER_PASSWORD.
 * Run: npm run import:data
 * (From project root: node scripts/import-journalytic-ibkr.js)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { parse } from 'csv-parse/sync'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// Load .env.local from project root
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
  console.error('Add IMPORT_USER_EMAIL and IMPORT_USER_PASSWORD to .env.local (the account you use to log in)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Journalytic export path — point at your actual export folder. Script no-ops gracefully if missing.
const JOURNALYTIC_CSV = path.join(PROJECT_ROOT, 'data', 'private', 'user-exports', 'My_Workspace_entries.csv')
// IBKR Transaction History CSV (raw lots). Moved into data/private/ibkr/.
const IBKR_CSV = path.join(PROJECT_ROOT, 'data', 'private', 'ibkr', 'TRANSACTIONS.csv')

// Parse Journalytic body for decision blocks: ### Buy Decision / ### Sell Decision / etc.
function parseDecisionBlocks(bodyMarkdown, entryId) {
  const blocks = []
  const regex = /###\s*(Buy|Sell|Short|Trim|Hold|Pass|Speculate|Add more)\s+Decision\s*\n([\s\S]*?)(?=###\s*(?:Buy|Sell|Short|Trim|Hold|Pass|Speculate|Add more)\s+Decision|$)/gi
  let m
  while ((m = regex.exec(bodyMarkdown)) !== null) {
    const type = m[1].toLowerCase().replace(/\s+/g, '_')
    const block = m[2].trim()
    const ticker = block.match(/\*\*\$([A-Z0-9.]+\s*[A-Z0-9.]*)\*\*/)?.[1]?.trim() || ''
    const companyMatch = block.match(/\*\*\$[^*]+\*\*\s*-\s*([^\n*]+)/)
    const companyName = companyMatch ? companyMatch[1].trim() : ''
    const dateMatch = block.match(/(?:Date|Decision Date):\s*([^\n]+)/i)
    let actionDate = ''
    if (dateMatch) {
      const d = new Date(dateMatch[1].trim())
      if (!isNaN(d.getTime())) actionDate = d.toISOString().slice(0, 10)
    }
    const priceMatch = block.match(/(?:Price|Decision Price):\s*([\d.,]+)/i)
    const price = priceMatch ? priceMatch[1].trim() : ''
    const sharesMatch = block.match(/(?:Shares?):\s*([\d.,]+)/i)
    const shares = sharesMatch ? parseFloat(sharesMatch[1].replace(/,/g, '')) : null
    const reasonMatch = block.match(/(?:Reason):\s*([^\n]+)/i)
    const reason = reasonMatch ? reasonMatch[1].trim() : ''
    const expandedMatch = block.match(/(?:Expanded Reasoning):\s*([\s\S]*?)(?=\n\n|$)/i)
    const notes = expandedMatch ? expandedMatch[1].trim().slice(0, 2000) : ''
    const actionType = type === 'add_more' ? 'add_more' : type === 'add more' ? 'add_more' : type
    const validTypes = ['buy', 'sell', 'short', 'trim', 'hold', 'pass', 'speculate', 'add_more']
    if (validTypes.includes(actionType)) {
      blocks.push({
        type: actionType,
        ticker: ticker.split(/\s/)[0] || '',
        company_name: companyName,
        action_date: actionDate,
        price,
        shares,
        reason,
        notes,
        entry_id: entryId,
      })
    }
  }
  return blocks
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

  // Fail fast if schema not applied (no table 'public.entries')
  const { error: schemaError } = await supabase.from('entries').select('id').limit(1)
  if (schemaError && (schemaError.message || '').includes('schema cache')) {
    console.error('')
    console.error('The database schema is not applied. The table public.entries does not exist.')
    console.error('')
    console.error('Do this first:')
    console.error('  1. Open your Supabase project → SQL Editor → New query')
    console.error('  2. Paste the contents of: supabase/apply-all-migrations.sql')
    console.error('  3. Click Run')
    console.error('  4. Then run: npm run import:data')
    console.error('')
    process.exit(1)
  }

  // --- Journalytic entries ---
  if (!fs.existsSync(JOURNALYTIC_CSV)) {
    console.warn('Journalytic CSV not found:', JOURNALYTIC_CSV)
  } else {
    const csvText = fs.readFileSync(JOURNALYTIC_CSV, 'utf-8')
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true })
    console.log('Journalytic entries to import:', rows.length)

    const entryIdToUuid = {}
    for (const row of rows) {
      const entryId = (row.EntryId || row.entry_id || '').trim()
      if (!entryId) continue
      const date = (row.Date || row.date || '').trim() || new Date().toISOString().slice(0, 10)
      const author = (row.Author || row.author || '').trim()
      const tagsStr = (row.Tags || row.tags || '').trim()
      const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : []
      const title_markdown = (row.TitleMarkdown || row.title_markdown || '').trim()
      const body_markdown = (row.BodyMarkdown || row.body_markdown || '').trim()

      const { data: entry, error } = await supabase
        .from('entries')
        .insert({
          user_id: userId,
          entry_id: entryId,
          date,
          author,
          tags,
          title_markdown,
          body_markdown,
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          const { data: existing } = await supabase.from('entries').select('id').eq('entry_id', entryId).eq('user_id', userId).single()
          if (existing) entryIdToUuid[entryId] = existing.id
        }
        if (!entryIdToUuid[entryId]) console.warn('Entry', entryId, error.message)
      } else if (entry) {
        entryIdToUuid[entryId] = entry.id
      }
    }

    // --- Actions from body ---
    let actionsCreated = 0
    for (const row of rows) {
      const entryId = (row.EntryId || row.entry_id || '').trim()
      const uuid = entryIdToUuid[entryId]
      if (!uuid) continue
      const body = (row.BodyMarkdown || row.body_markdown || '').trim()
      const date = (row.Date || row.date || '').trim() || new Date().toISOString().slice(0, 10)
      const blocks = parseDecisionBlocks(body, uuid)
      for (const b of blocks) {
        const { error } = await supabase.from('actions').insert({
          entry_id: uuid,
          type: b.type,
          ticker: b.ticker,
          company_name: b.company_name || null,
          action_date: b.action_date || date,
          price: b.price || '',
          shares: b.shares,
          reason: b.reason || '',
          notes: (b.notes || '').slice(0, 2000),
        })
        if (!error) actionsCreated++
      }
    }
    console.log('Entries and actions imported. Actions created:', actionsCreated)
  }

  // --- IBKR transactions ---
  if (!fs.existsSync(IBKR_CSV)) {
    console.warn('IBKR CSV not found:', IBKR_CSV)
  } else {
    const lines = fs.readFileSync(IBKR_CSV, 'utf-8').split(/\r?\n/)
    const header = lines.find((l) => l.startsWith('Transaction History,Header,'))
    const dataLines = lines.filter((l) => l.startsWith('Transaction History,Data,'))
    const cols = header ? header.split(',').map((c) => c.trim()) : ['Date', 'Account', 'Description', 'Transaction Type', 'Symbol', 'Quantity', 'Price', 'Price Currency', 'Gross Amount ', 'Commission', 'Net Amount']
    let inserted = 0
    const tradeTypes = new Set(['Buy', 'Sell'])
    for (const line of dataLines) {
      const parts = line.split(',').map((p) => p.trim())
      if (parts.length < 8) continue
      const txDate = parts[2]
      const account = parts[3] || ''
      const description = parts[4] || ''
      const txType = parts[5] // Transaction Type
      if (!tradeTypes.has(txType)) continue
      const symbol = parts[6] || ''
      const quantity = parts[7] !== undefined && parts[7] !== '' && parts[7] !== '-' ? parseFloat(parts[7]) : null
      const price = parts[8] !== undefined && parts[8] !== '' && parts[8] !== '-' ? parseFloat(parts[8]) : null
      const priceCurrency = parts[9] || ''
      const grossAmount = parts[10] !== undefined && parts[10] !== '' ? parseFloat(parts[10]) : null
      const commission = parts[11] !== undefined && parts[11] !== '' ? parseFloat(parts[11]) : null
      const netAmount = parts[12] !== undefined && parts[12] !== '' ? parseFloat(parts[12]) : null

      const { error } = await supabase.from('ibkr_transactions').insert({
        user_id: userId,
        tx_date: txDate,
        account,
        description,
        transaction_type: txType,
        symbol,
        quantity,
        price,
        price_currency: priceCurrency,
        gross_amount: grossAmount,
        commission,
        net_amount: netAmount,
      })
      if (!error) inserted++
    }
    console.log('IBKR transactions imported:', inserted)
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
