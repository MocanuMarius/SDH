/**
 * backfill-instrument-fields.mjs
 *
 * One-shot backfill following migration
 * 20260422120000_actions_instrument_type_options.sql.
 *
 * Walks every row in `public.actions` whose `ticker` parses as an
 * OCC option symbol (or a "human" option ticker like
 * "CVNA 06MAR26 365 C") and populates the new structured columns:
 *
 *   instrument_type → 'option'
 *   option_strike   → parsed strike (numeric)
 *   option_right    → 'C' | 'P'
 *   option_expiry   → parsed expiry (date)
 *
 * The `ticker` field is left as-is so the historical record is
 * preserved. The display layer (OptionTypeChip, IdeaDetailPage,
 * etc.) prefers the structured columns and falls back to ticker
 * parsing for any row that didn't get migrated — so this backfill
 * is opportunistic, not load-bearing.
 *
 * Idempotent: skips rows that already have a non-default
 * instrument_type, and rows that don't parse as an option.
 *
 * Run:
 *   node scripts/backfill-instrument-fields.mjs
 *   DRY_RUN=1 node scripts/backfill-instrument-fields.mjs    # report only
 */

import path from 'node:path'
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

const DRY_RUN = process.env.DRY_RUN === '1'
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

// ─── Inline option parsers ──────────────────────────────────────────
// Mirrors src/utils/optionSymbol.ts. Inlined here so the script is
// dependency-free and runnable without the Vite/TS toolchain.

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

function pivot2DigitYear(yy) {
  return yy < 80 ? 2000 + yy : 1900 + yy
}

function parseOcc(symbol) {
  // OCC: padded ticker (≤6) + YYMMDD + C|P + 8-digit strike (×1000).
  const m = symbol.match(/^(.+?)\s*(\d{6})([CP])(\d{8})$/)
  if (!m) return null
  const [, rawTicker, dateStr, right, strikeStr] = m
  const ticker = rawTicker.trim()
  if (!ticker) return null
  const yy = parseInt(dateStr.slice(0, 2), 10)
  const mm = parseInt(dateStr.slice(2, 4), 10)
  const dd = parseInt(dateStr.slice(4, 6), 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const year = pivot2DigitYear(yy)
  const expiry = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const strike = parseInt(strikeStr, 10) / 1000
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right }
}

function parseHuman(symbol) {
  // "APP 15JAN27 200 P" — TICKER DDMONYY STRIKE C|P
  const parts = symbol.trim().split(/\s+/)
  if (parts.length !== 4) return null
  const [ticker, dateStr, strikeStr, right] = parts
  if (right !== 'C' && right !== 'P') return null
  const dateMatch = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/)
  if (!dateMatch) return null
  const [, dayStr, monStr, yyStr] = dateMatch
  const monthNum = MONTHS[monStr]
  if (!monthNum) return null
  const day = String(parseInt(dayStr, 10)).padStart(2, '0')
  const year = pivot2DigitYear(parseInt(yyStr, 10))
  const expiry = `${year}-${monthNum}-${day}`
  const strike = parseFloat(strikeStr)
  if (!Number.isFinite(strike)) return null
  return { underlying: ticker, expiry, strike, right }
}

function parseOptionSymbol(s) {
  if (!s || typeof s !== 'string') return null
  const trimmed = s.trim()
  if (!trimmed) return null
  return parseOcc(trimmed) ?? parseHuman(trimmed)
}

// ─── Backfill ──────────────────────────────────────────────────────

await client.connect()
try {
  // Pull every row that's still tagged as a stock (the default) so
  // we don't second-guess rows the user already explicitly typed.
  const { rows } = await client.query(
    `SELECT id, ticker, instrument_type, option_strike, option_right, option_expiry
       FROM public.actions
      WHERE instrument_type = 'stock'
        AND ticker IS NOT NULL
        AND length(ticker) > 0`
  )
  console.log(`[backfill] scanning ${rows.length} rows…`)

  let parsedCount = 0
  let skippedCount = 0
  let updatedCount = 0
  for (const row of rows) {
    const parsed = parseOptionSymbol(row.ticker)
    if (!parsed) {
      skippedCount++
      continue
    }
    parsedCount++
    if (DRY_RUN) {
      console.log(
        `  [dry] ${row.id}  ${row.ticker.padEnd(28)} → ` +
        `${parsed.underlying} ${parsed.right} ${parsed.strike} ${parsed.expiry}`
      )
      continue
    }
    await client.query(
      `UPDATE public.actions
          SET instrument_type = 'option',
              option_strike   = $2,
              option_right    = $3,
              option_expiry   = $4
        WHERE id = $1`,
      [row.id, parsed.strike, parsed.right, parsed.expiry]
    )
    updatedCount++
  }

  console.log(`[backfill] parsed:   ${parsedCount}`)
  console.log(`[backfill] skipped:  ${skippedCount} (not option-shaped)`)
  if (DRY_RUN) {
    console.log(`[backfill] DRY_RUN — no rows written.`)
  } else {
    console.log(`[backfill] updated:  ${updatedCount}`)
  }
} finally {
  await client.end()
}
