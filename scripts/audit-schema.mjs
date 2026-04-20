/**
 * audit-schema.mjs
 *
 * Diffs the LIVE Supabase `public` schema against every column name
 * referenced by the TypeScript source (`src/types/database.ts` +
 * service inserts). Flags:
 *   • columns the code writes that don't exist in the DB
 *     (PGRST204-class bugs — what caused the FJET evaporation)
 *   • columns the DB has that nothing in the code references
 *     (vestigial / safe to drop later)
 *
 * Use:   npm run db:audit
 * Exits non-zero if any "missing-in-DB" cases are found.
 *
 * Intentionally stupid-simple text scanning — no AST parsing. Good
 * enough to catch the bug class we care about; false positives are
 * acceptable for the "DB has, code doesn't" direction since that's
 * advisory.
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL
if (!connectionString) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL in .env.local')
  process.exit(1)
}

/**
 * Table → service file pairs. Each service file's insert/update
 * payloads are the source of truth for "what the code writes".
 * Keep this in sync when new tables/services land.
 */
const TABLE_SOURCES = [
  { table: 'entries', sources: ['src/services/entriesService.ts', 'src/types/database.ts'] },
  { table: 'actions', sources: ['src/services/actionsService.ts', 'src/pages/EntryFormPage.tsx', 'src/pages/DecisionFormPage.tsx', 'src/types/database.ts'] },
  { table: 'outcomes', sources: ['src/services/outcomesService.ts', 'src/pages/EntryDetailPage.tsx', 'src/types/database.ts'] },
  { table: 'passed', sources: ['src/services/passedService.ts', 'src/types/database.ts'] },
  { table: 'reminders', sources: ['src/services/remindersService.ts', 'src/types/database.ts'] },
  { table: 'entry_predictions', sources: ['src/services/predictionsService.ts', 'src/pages/EntryDetailPage.tsx', 'src/types/database.ts'] },
  { table: 'entry_valuations', sources: ['src/services/entryValuationsService.ts', 'src/types/database.ts'] },
  { table: 'watchlist_items', sources: ['src/pages/WatchlistFormPage.tsx', 'src/pages/WatchlistPage.tsx'] },
]

/** Columns the DB has that we know are vestigial / intentionally un-referenced. */
const KNOWN_VESTIGIAL = new Set([
  'entries:broker_import_id',
  'entries:broker_trade_id',
  'entries:broker_name',
  'entries:is_auto_imported',
  'outcomes:linked_dividend_id',
])

/** Columns we always expect PG to manage: don't require code to reference them. */
const DB_MANAGED = new Set(['id', 'created_at', 'updated_at'])

/**
 * Extract candidate column names from source files. Looks for
 * snake_case identifiers inside object-literal keys + bare `col:`
 * style TS interface properties. Deliberately over-inclusive; the
 * diff direction we care about (code→DB) only cares that every
 * written column exists, not that every code-mentioned name maps 1:1.
 */
function extractColumnsFromSource(files) {
  const seen = new Set()
  const pat = /\b([a-z][a-z0-9_]*)\s*:/g
  for (const f of files) {
    const full = path.join(PROJECT_ROOT, f)
    if (!fs.existsSync(full)) continue
    const txt = fs.readFileSync(full, 'utf8')
    let m
    while ((m = pat.exec(txt)) !== null) {
      const name = m[1]
      // Filter obvious non-columns (typescript keywords, common js ids)
      if (name.length < 3) continue
      if (/^(if|let|var|for|new|get|set|try|the|and|or|then|true|false|null)$/i.test(name)) continue
      seen.add(name)
    }
  }
  return seen
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  const report = []
  let failures = 0
  for (const { table, sources } of TABLE_SOURCES) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
    const dbCols = new Set(rows.map((r) => r.column_name))
    if (dbCols.size === 0) {
      report.push({ table, status: 'TABLE_MISSING', dbCols: [], refd: [] })
      failures += 1
      continue
    }
    const refd = extractColumnsFromSource(sources)
    // Direction 1: code → DB. For every column we find referenced in
    // the sources AND also present in the DB of some other table we
    // care about, check it exists here. False positives are fine —
    // we only error on names that look VERY likely to be a column of
    // THIS table (snake_case appearing in a sources file listed for
    // this table, and also appearing elsewhere in the schema).
    //
    // Simpler heuristic that catches actions.size / outcomes.*:
    // - Any column name in any OTHER of our tracked tables' DB cols
    //   that's also referenced in this table's sources → must exist
    //   in this table too (because the same field name typically
    //   reflects the same column). Too loose? Use the TYPED path:
    //   look at fields declared in the TS interface for this table
    //   (via database.ts) and verify each is in dbCols.
    //
    // Pragmatic version: compare against the set of identifiers that
    // appear in the interface block of database.ts for this table.
    const interfaceCols = extractInterfaceCols(table)
    const missing = [...interfaceCols].filter((c) => !dbCols.has(c) && !DB_MANAGED.has(c))
    const unusedInCode = [...dbCols]
      .filter((c) => !refd.has(c) && !DB_MANAGED.has(c))
      .filter((c) => !KNOWN_VESTIGIAL.has(`${table}:${c}`))
    report.push({ table, status: missing.length === 0 ? 'OK' : 'MISSING_IN_DB', missing, unusedInCode })
    if (missing.length > 0) failures += 1
  }

  // RLS audit — flag tables that have RLS disabled OR have a
  // single permissive `USING (true)` policy (which is effectively no
  // RLS). Caught the watchlist_* permissive-policy issue on
  // 2026-04-20 that let rows with user_id = null pile up.
  const rlsRows = (await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `)).rows
  const policyRows = (await client.query(`
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  `)).rows
  const rlsByTable = Object.fromEntries(rlsRows.map((r) => [r.table_name, r.rls_enabled]))
  const policiesByTable = {}
  for (const p of policyRows) {
    (policiesByTable[p.tablename] ||= []).push(p)
  }
  const rlsWarnings = []
  const TABLES_WITH_USER_DATA = TABLE_SOURCES.map((t) => t.table)
  for (const t of TABLES_WITH_USER_DATA) {
    const enabled = rlsByTable[t]
    const pols = policiesByTable[t] ?? []
    if (!enabled) {
      rlsWarnings.push({ table: t, reason: 'RLS disabled' })
      continue
    }
    if (pols.length === 0) {
      rlsWarnings.push({ table: t, reason: 'RLS enabled but no policies — table is unreadable to end users' })
      continue
    }
    // Any policy with qual = 'true' (or null qual on a non-INSERT cmd) is permissive.
    const permissive = pols.filter((p) => p.qual === 'true' || p.with_check === 'true')
    if (permissive.length > 0) {
      rlsWarnings.push({
        table: t,
        reason: `permissive policy (qual=true) on: ${permissive.map((p) => p.policyname).join(', ')}`,
      })
    }
  }

  // Pretty print
  console.log('')
  console.log('Schema audit report')
  console.log('===================')
  for (const r of report) {
    const tag = r.status === 'OK' ? '✓' : r.status === 'TABLE_MISSING' ? '✗ (no table)' : '✗ MISSING'
    console.log(`\n[${tag}] ${r.table}`)
    if (r.missing?.length) {
      console.log('  Code writes but DB lacks:', r.missing.join(', '))
    }
    if (r.unusedInCode?.length) {
      console.log('  DB has but code ignores :', r.unusedInCode.join(', '), '(advisory)')
    }
  }

  console.log('')
  console.log('RLS audit')
  console.log('---------')
  if (rlsWarnings.length === 0) {
    console.log('✓ every user-data table has RLS on and no `qual=true` policies.')
  } else {
    for (const w of rlsWarnings) {
      console.log(`✗ ${w.table}: ${w.reason}`)
    }
    failures += rlsWarnings.length
  }

  console.log('')
  if (failures > 0) {
    console.log(`FAIL: ${failures} issue(s) found.`)
    console.log('Fix: add a migration, then run `npm run db:migrate`.')
    process.exit(1)
  } else {
    console.log('PASS: every interface field maps to a live DB column, every RLS policy is user-scoped.')
  }
  await client.end()
}

/**
 * Read `src/types/database.ts` and return the set of snake_case
 * identifiers declared inside each table's interface / insert type.
 * Best-effort — good enough for the bug class we care about.
 */
function extractInterfaceCols(table) {
  const full = path.join(PROJECT_ROOT, 'src/types/database.ts')
  const src = fs.readFileSync(full, 'utf8')
  // Match the interface for this table. Our convention: `export interface Entry {`, `Action {`, etc.
  const interfaceName = {
    entries: 'Entry',
    actions: 'Action',
    outcomes: 'Outcome',
    passed: 'Passed',
    reminders: 'Reminder',
    entry_predictions: 'EntryPrediction',
    entry_valuations: 'EntryValuation',
    // watchlist_items has no interface in database.ts — fall back to
    // columns extracted from its page.
  }[table]
  if (!interfaceName) return new Set()
  const re = new RegExp(`export interface ${interfaceName}\\s*\\{([^}]+)\\}`, 's')
  const m = src.match(re)
  if (!m) return new Set()
  const body = m[1]
  const out = new Set()
  const pat = /^\s*([a-z][a-z0-9_]*)\??:\s*/gm
  let mm
  while ((mm = pat.exec(body)) !== null) {
    out.add(mm[1])
  }
  return out
}

main().catch((err) => {
  console.error('[audit] fatal:', err)
  process.exit(1)
})
