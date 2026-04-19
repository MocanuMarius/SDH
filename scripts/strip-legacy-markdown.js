/**
 * One-time migration: strip legacy markdown markers from every entry's
 * `title_markdown` and `body_markdown`. Per docs/PRINCIPLES.md the source
 * of truth on disk is plain text; markdown markers are not allowed.
 *
 * Background:
 *  - Until recently the entry editor stored content as raw markdown.
 *  - The model flipped to plain-text. Save-time strip in EntryFormPage
 *    cleans new saves, but historical rows still have `**bold**`, `# h1`,
 *    `> blockquote`, `- bullet` markers.
 *  - PlainTextWithTickers uses stripLegacyMarkdown at RENDER time as a
 *    safety net; this script makes the database itself clean so the
 *    render-time strip can eventually be removed.
 *
 * Behaviour:
 *  - Dry run by default (DRY_RUN=1). Pass DRY_RUN=0 to actually write.
 *  - Skips rows whose stripped value === original (no work to do).
 *  - Logs each change with a short before/after preview.
 *  - Idempotent — running twice on already-clean data is a no-op.
 *
 * Run:
 *   node scripts/strip-legacy-markdown.js              # dry run
 *   DRY_RUN=0 node scripts/strip-legacy-markdown.js    # apply
 *
 * Requires .env.local with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * (or the SUPABASE_* / NEXT_PUBLIC_* equivalents).
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL
// Prefer service-role key when available so the script can bypass RLS
// and see every user's row (this is a single-user app today, but the
// RLS policy still requires `auth.uid()`, which a script doesn't have).
// Fall back to anon for local dev where service role isn't set.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or anon key in .env.local')
  process.exit(1)
}

const DRY_RUN = process.env.DRY_RUN !== '0'

const supabase = createClient(supabaseUrl, supabaseKey)

// Mirror of src/utils/stripLegacyMarkdown.ts. Kept inline so the script is
// self-contained (Node, no JSX/TS bundler in the loop). If the regex set
// changes there, update here too — they should never diverge.
function stripLegacyMarkdown(text) {
  if (!text) return text
  return (
    text
      // Leading `### ` / `## ` / `# ` headings → drop the marker
      .replace(/^(#{1,6})\s+/gm, '')
      // Leading `> ` blockquote prefix
      .replace(/^>\s+/gm, '')
      // Leading list bullets `- ` / `* `
      .replace(/^[-*]\s+/gm, '')
      // **bold** / __bold__ / *italic* / _italic_ / ~~strike~~
      .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
      .replace(/__([^_\n]+?)__/g, '$1')
      .replace(/(?<![*\w])\*([^*\n]+?)\*(?!\w)/g, '$1')
      .replace(/(?<![_\w])_([^_\n]+?)_(?!\w)/g, '$1')
      .replace(/~~([^~\n]+?)~~/g, '$1')
      // Fenced code blocks ```lang\n...\n``` → keep content
      .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)\n?```/g, '$1')
      // Inline code `word` → word
      .replace(/`([^`\n]+?)`/g, '$1')
  )
}

function preview(text, max = 80) {
  if (!text) return '(empty)'
  const oneLine = text.replace(/\n+/g, ' \\n ').trim()
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine
}

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} strip-legacy-markdown`)
  console.log('')

  const { data: entries, error } = await supabase
    .from('entries')
    .select('id, title_markdown, body_markdown')
  if (error) {
    console.error('Failed to list entries:', error.message)
    process.exit(1)
  }

  console.log(`Loaded ${entries?.length ?? 0} entries.`)
  let changed = 0
  let updated = 0

  for (const entry of entries ?? []) {
    const cleanedTitle = stripLegacyMarkdown(entry.title_markdown ?? '')
    const cleanedBody = stripLegacyMarkdown(entry.body_markdown ?? '')
    const titleChanged = cleanedTitle !== (entry.title_markdown ?? '')
    const bodyChanged = cleanedBody !== (entry.body_markdown ?? '')
    if (!titleChanged && !bodyChanged) continue

    changed++
    console.log(`\nentry ${entry.id.slice(0, 8)}…`)
    if (titleChanged) {
      console.log(`  title:  ${preview(entry.title_markdown)}`)
      console.log(`       → ${preview(cleanedTitle)}`)
    }
    if (bodyChanged) {
      console.log(`  body:   ${preview(entry.body_markdown)}`)
      console.log(`       → ${preview(cleanedBody)}`)
    }

    if (DRY_RUN) continue

    const patch = {}
    if (titleChanged) patch.title_markdown = cleanedTitle
    if (bodyChanged) patch.body_markdown = cleanedBody
    const { error: updateError } = await supabase
      .from('entries')
      .update(patch)
      .eq('id', entry.id)
    if (updateError) {
      console.warn(`  ! update failed: ${updateError.message}`)
      continue
    }
    updated++
  }

  console.log('')
  console.log(
    `${DRY_RUN ? 'Would update' : 'Updated'} ${DRY_RUN ? changed : updated} of ${entries?.length ?? 0} entries.`,
  )
  if (DRY_RUN && changed > 0) {
    console.log('')
    console.log('Re-run with DRY_RUN=0 to apply.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
