/**
 * apply-pending-migrations.mjs
 *
 * Applies migration SQL files in `supabase/migrations/` that haven't
 * been recorded in `public._applied_migrations`. Idempotent: running
 * twice with no new files is a no-op.
 *
 * Why this exists: twice now (actions.size, outcomes catchup) we
 * added a migration file to the repo but it never made it to the
 * live DB. Every write against the new column then 400'd with
 * PGRST204 and — because several silent catches were in place —
 * evaporated the user's data without any error. See audit note
 * 2026-04-20.
 *
 * Run:
 *   npm run db:migrate                       # apply pending
 *   BASELINE=1 npm run db:migrate            # seed tracking table
 *                                            # from current folder
 *                                            # WITHOUT running each
 *                                            # file (use on a DB
 *                                            # that's already in
 *                                            # sync with the repo)
 *   DRY_RUN=1 npm run db:migrate             # list what would run
 *
 * Needs `.env.local` with POSTGRES_URL_NON_POOLING (or POSTGRES_URL)
 * and a DB user that can ALTER/CREATE. Node 22+, `pg` dev dep.
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'supabase', 'migrations')

loadDotenv({ path: path.join(PROJECT_ROOT, '.env.local') })

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL
if (!connectionString) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL in .env.local')
  process.exit(1)
}

const BASELINE = process.env.BASELINE === '1'
const DRY_RUN = process.env.DRY_RUN === '1'

// Supabase pooler often returns a self-signed cert — same treatment the
// rest of the one-off scripts use.
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function listMigrationFiles() {
  // Only `.sql` files; skip the ad-hoc diagnostic / applied_ helpers
  // that predate the runner (they're kept in the folder for reference
  // but weren't meant to be re-applied by a generic runner).
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !f.startsWith('diagnostic_') && !f.startsWith('applied_'))
    .sort() // filename prefixes are timestamps, so lexicographic = chronological
}

async function ensureTrackingTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._applied_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      checksum    text,
      baselined   boolean NOT NULL DEFAULT false
    )
  `)
  await client.query(`COMMENT ON TABLE public._applied_migrations IS 'Tracks which files in supabase/migrations/ have been applied. Managed by scripts/apply-pending-migrations.mjs.'`)
}

async function appliedSet() {
  const { rows } = await client.query(`SELECT filename FROM public._applied_migrations`)
  return new Set(rows.map((r) => r.filename))
}

async function baseline(files) {
  // Mark every file as already-applied WITHOUT running it. Use on a
  // DB that's already in sync with the repo. Safe to run more than
  // once (upsert) — subsequent runs just update the checksum.
  console.log(`[baseline] recording ${files.length} file(s) as already applied…`)
  for (const f of files) {
    const body = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    await client.query(
      `INSERT INTO public._applied_migrations (filename, checksum, baselined)
       VALUES ($1, $2, true)
       ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum`,
      [f, sha256(body)],
    )
  }
  console.log('[baseline] done.')
}

async function applyPending(files, already) {
  const pending = files.filter((f) => !already.has(f))
  if (pending.length === 0) {
    console.log('[migrate] nothing to do — DB is up to date.')
    return
  }
  console.log(`[migrate] ${pending.length} pending migration(s):`)
  pending.forEach((f) => console.log('  •', f))
  if (DRY_RUN) {
    console.log('[migrate] DRY_RUN=1 — not applying.')
    return
  }
  for (const f of pending) {
    const full = path.join(MIGRATIONS_DIR, f)
    const body = fs.readFileSync(full, 'utf8')
    process.stdout.write(`[migrate] applying ${f}… `)
    await client.query('BEGIN')
    try {
      await client.query(body)
      await client.query(
        `INSERT INTO public._applied_migrations (filename, checksum, baselined) VALUES ($1, $2, false)`,
        [f, sha256(body)],
      )
      await client.query('COMMIT')
      console.log('ok.')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('FAILED.')
      console.error(err)
      process.exit(1)
    }
  }
  console.log('[migrate] all pending migrations applied.')
}

async function main() {
  await client.connect()
  await ensureTrackingTable()
  const files = listMigrationFiles()
  const already = await appliedSet()
  if (BASELINE) {
    await baseline(files)
  } else if (already.size === 0 && files.length > 0) {
    // First-ever run with files present and nothing tracked → loudly
    // refuse rather than apply everything against a DB that probably
    // already has most/all of it applied. Ask the user to baseline
    // once, then re-run to pick up anything genuinely new.
    console.error('[migrate] tracking table is empty but the migrations/ folder has', files.length, 'file(s).')
    console.error('[migrate] Refusing to run everything blindly. Options:')
    console.error('[migrate]   BASELINE=1 npm run db:migrate   # mark all current files as applied')
    console.error('[migrate]   DRY_RUN=1 npm run db:migrate    # list what a non-baselined run WOULD do')
    process.exit(2)
  } else {
    await applyPending(files, already)
  }
  await client.end()
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
