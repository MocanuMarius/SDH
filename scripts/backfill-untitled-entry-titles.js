/**
 * Backfill title_markdown for entries that are "Untitled" but have at least one action.
 * Sets title to e.g. "Pass ($ATKR)" from the first action (by action_date).
 *
 * Requires: .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_*).
 * Run: node scripts/backfill-untitled-entry-titles.js
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// Prefer service-role so we can touch every user's rows; fall back to anon
// only if service-role isn't set (in which case RLS will restrict writes).
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or key in .env.local')
  console.error('Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or an anon key.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function isUntitled(title) {
  if (title == null) return true
  const t = String(title).trim()
  return t === '' || /^(\(Untitled\)|Untitled)$/i.test(t)
}

function derivedTitleFromAction(action) {
  const type = (action.type || 'decision').replace(/_/g, ' ')
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1)
  const ticker = (action.ticker || '').trim().toUpperCase()
  if (!ticker) return null
  return `${capitalized} ($${ticker})`
}

async function main() {
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select('id, title_markdown')
  if (entriesError) {
    console.error('Failed to list entries:', entriesError.message)
    process.exit(1)
  }

  const untitled = (entries || []).filter((e) => isUntitled(e.title_markdown))
  console.log(`Found ${untitled.length} untitled entries (of ${(entries || []).length} total).`)

  let updated = 0
  for (const entry of untitled) {
    const { data: actions, error: actionsError } = await supabase
      .from('actions')
      .select('type, ticker')
      .eq('entry_id', entry.id)
      .order('action_date', { ascending: true })
      .limit(1)
    if (actionsError || !actions?.length) continue
    const title = derivedTitleFromAction(actions[0])
    if (!title) continue
    const { error: updateError } = await supabase
      .from('entries')
      .update({ title_markdown: title })
      .eq('id', entry.id)
    if (updateError) {
      console.warn('Update failed for entry', entry.id, updateError.message)
      continue
    }
    updated++
    console.log('  ', entry.id.slice(0, 8) + '…', '→', title)
  }

  console.log('Done. Updated', updated, 'entries.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
