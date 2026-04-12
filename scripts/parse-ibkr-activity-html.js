/**
 * Parse IBKR Activity Statement HTML files and output a single JSON summary.
 * Run: node scripts/parse-ibkr-activity-html.js
 * Reads: data/private/ibkr-raw/ (all .html/.htm, recursively — includes Annuals.YYYY/ subfolders)
 * Writes: public/data/ibkr-activity-summary.json
 *
 * NOTE: the per-symbol realized/unrealized totals in the FIFO table are *aggregates*.
 * They do not tell you the P&L of an individual trade. For per-trade realized P&L,
 * use scripts/seed-outcomes-from-ibkr.js which runs FIFO matching on the Transaction
 * History CSV directly.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'private', 'ibkr-raw')
const OUT_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'ibkr-activity-summary.json')

function findAllHtml(dir, list = []) {
  if (!fs.existsSync(dir)) return list
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) findAllHtml(full, list)
    else if (e.name.endsWith('.html') || e.name.endsWith('.htm')) list.push(full)
  }
  return list
}

function stripCell(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNum(text) {
  const s = stripCell(text).replace(/,/g, '')
  if (s === '' || s === '--' || s === '-') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function extractTdContents(trHtml) {
  const parts = trHtml.replace(/<t[dh][^>]*>/gi, '\x00').split('\x00')
  return parts
    .map((p) => p.replace(/<\/t[dh]>.*/i, '').replace(/<[^>]+>/g, ''))
    .map((s) => stripCell(s))
    .filter((s) => s.length > 0)
}

/**
 * Extract TDs from a row preserving empty cells (so column positions are stable).
 * Needed for the Trades table where empty subtotal columns would otherwise collapse.
 */
function extractTdsPreserveEmpty(rowHtml) {
  const tds = []
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = tdRegex.exec(rowHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '')
    tds.push(stripCell(text))
  }
  return tds
}

/**
 * Extract per-trade rows from a Trades table (id="tblTransactions_{accountId}Body").
 *
 * Table structure:
 *   - Asset-class header row (single cell, class "header-asset") — "Stocks", "Equity and Index Options", etc.
 *   - Currency header row (single cell, class "header-currency") — "USD", "CAD", "EUR", "GBP"
 *   - Trade data rows (11 cells: Symbol, Date/Time, Qty, TPrice, CPrice, Proceeds, Comm, Basis, RealizedPL, MtmPL, Code)
 *   - Subtotal / Total rows (skipped)
 *
 * IBKR has already done FIFO matching — the RealizedPL column is the authoritative per-trade P&L.
 * Non-zero RealizedPL means this trade closed (or partially closed) a position.
 */
function extractTradesFromTransactionsSection(html, accountId) {
  const bodyId = `tblTransactions_${accountId}Body`
  const sectionStart = html.indexOf(`id="${bodyId}"`)
  if (sectionStart < 0) return []
  // Take the chunk from the section start through to the next sectionHeading (or end of file).
  const chunkEnd = html.indexOf('<div class="sectionHeading', sectionStart)
  const chunk = html.slice(sectionStart, chunkEnd > 0 ? chunkEnd : undefined)
  // Find the first table inside the chunk (the Trades table).
  const tableMatch = chunk.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) return []
  const tableInner = tableMatch[1]

  const trades = []
  const rowRegex = /<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>|<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let currentAssetClass = null
  let currentCurrency = null
  let m
  while ((m = rowRegex.exec(tableInner)) !== null) {
    const rowClass = (m[1] || '').toLowerCase()
    const rowInner = m[2] || m[3] || ''
    if (rowClass.includes('subtotal') || rowClass.includes('total')) continue

    // Asset-class / currency header detection — single TD with specific class.
    const assetHeaderMatch = rowInner.match(/<td[^>]*class="[^"]*header-asset[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
    if (assetHeaderMatch) {
      currentAssetClass = stripCell(assetHeaderMatch[1].replace(/<[^>]+>/g, ''))
      currentCurrency = null
      continue
    }
    const currencyHeaderMatch = rowInner.match(/<td[^>]*class="[^"]*header-currency[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
    if (currencyHeaderMatch) {
      currentCurrency = stripCell(currencyHeaderMatch[1].replace(/<[^>]+>/g, ''))
      continue
    }

    const cells = extractTdsPreserveEmpty(`<tr>${rowInner}</tr>`)
    if (cells.length < 11) continue
    const symbol = cells[0]
    // Skip Total rows (first cell says "Total XYZ")
    if (!symbol || /^total/i.test(symbol)) continue
    const dateTime = cells[1]
    // Dates look like "2026-01-02, 11:16:34". Reject rows without a valid date-time.
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateTime)) continue

    trades.push({
      accountId,
      assetClass: currentAssetClass,
      currency: currentCurrency,
      symbol,
      dateTime,
      date: dateTime.slice(0, 10),
      quantity: parseNum(cells[2]),
      tradePrice: parseNum(cells[3]),
      closePrice: parseNum(cells[4]),
      proceeds: parseNum(cells[5]),
      commFee: parseNum(cells[6]),
      basis: parseNum(cells[7]),
      realizedPL: parseNum(cells[8]),
      mtmPL: parseNum(cells[9]),
      code: cells[10],
    })
  }
  return trades
}

function parseOneFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8')
  const relPath = path.relative(PROJECT_ROOT, filePath)
  const result = { file: relPath, period: null, accountSummary: [], accounts: [] }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    const m = titleMatch[1].match(/Activity Statement\s+([^-]+)\s*-\s*([^<\-]+)/i) ||
      titleMatch[1].match(/Account Summary\s*<br>\s*<span>([^<]+)<\/span>/i)
    if (m) result.period = (m[1] || m[0]).trim() + ' - ' + (m[2] || '').trim()
  }

  const accountIdRegex = /secNAV_(U\d+)Heading|secMtmPerfSumByUnderlying_(U\d+)Heading|tblNAV_(U\d+)Body/g
  const accountIds = new Set()
  let acc
  while ((acc = accountIdRegex.exec(html)) !== null) accountIds.add(acc[1] || acc[2] || acc[3])

  const accountSummaryBodyMatch = html.match(/id="tblAccountSummaryBody"[^>]*>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)
  if (accountSummaryBodyMatch) {
    const tableHtml = accountSummaryBodyMatch[1]
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
    for (const row of rows) {
      const cells = extractTdContents(row)
      if (cells.length >= 5 && cells[0] && /^U\d+$/.test(cells[0])) {
        result.accountSummary.push({
          account: cells[0],
          alias: cells[1] || '',
          name: cells[2] || '',
          priorNav: parseNum(cells[3]),
          currentNav: parseNum(cells[4]),
          twr: cells[5] != null ? stripCell(cells[5]) : null,
        })
      }
    }
  }

  for (const accId of accountIds) {
    const account = { accountId: accId, changeInNav: {}, mtmStocks: [], realizedUnrealizedStocks: [], trades: [] }
    // Per-trade extraction — authoritative per-trade P&L (IBKR has already done FIFO).
    account.trades = extractTradesFromTransactionsSection(html, accId)

    const navBodyMatch = html.match(new RegExp(`id="tblNAV_${accId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}Body"[^>]*>([\\s\\S]*?)<div class="sectionHeading`, 'i'))
    if (navBodyMatch) {
      const changeMatch = navBodyMatch[1].match(/<table[^>]*>[\s\S]*?Change in NAV[\s\S]*?Starting Value[\s\S]*?<\/table>/i)
      const changeTableHtml = changeMatch ? changeMatch[0].replace(/^<table[^>]*>/, '').replace(/<\/table>$/, '') : null
      if (changeTableHtml) {
        const changeRows = changeTableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
        for (const row of changeRows) {
          const cells = extractTdContents(row)
          if (cells.length >= 2) {
            const label = cells[0].replace(/^\s*Indent\s*|^&nbsp;\s*/, '').trim() || cells[0]
            const key = label.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '')
            if (key && key !== 'total' && key !== 'change_in_nav') account.changeInNav[key] = { label, value: parseNum(cells[1]) }
          }
        }
      }
    }

    const mtmBodyMatch = html.match(new RegExp(`id="tblMtmPerfSumByUnderlying_${accId}Body"[^>]*>[\\s\\S]*?<table[^>]*>([\\s\\S]*?)</table>`, 'i'))
    if (mtmBodyMatch) {
      const table = mtmBodyMatch[1]
      const stocksStart = table.indexOf('>Stocks</td>')
      const stocksEnd = table.indexOf('Total Stocks</td>', stocksStart)
      const stocksSection = stocksStart >= 0 ? table.slice(stocksStart, stocksEnd >= 0 ? stocksEnd + 100 : undefined) : table
      const rows = stocksSection.match(/<tr>\s*<td>([A-Z0-9.]+)<\/td>[\s\S]*?<\/tr>/gi) || []
      for (const row of rows) {
        const cells = extractTdContents(row)
        if (cells.length >= 9 && !cells[0].toLowerCase().includes('total')) {
          account.mtmStocks.push({
            symbol: cells[0],
            priorQty: parseNum(cells[1]),
            currentQty: parseNum(cells[2]),
            priorPrice: parseNum(cells[3]),
            currentPrice: parseNum(cells[4]),
            positionPL: parseNum(cells[5]),
            transactionPL: parseNum(cells[6]),
            commissions: parseNum(cells[7]),
            other: parseNum(cells[8]),
            total: parseNum(cells[9]),
          })
        }
      }
    }

    // FIFO Performance Summary — per-symbol Realized/Unrealized totals in BASE CURRENCY (USD).
    // The table has sections per asset class (Stocks, Equity and Index Options, Forex, Bonds).
    // We walk all asset-class sections and tag each row with its class so the seeder can
    // use them as ground truth for per-trade USD attribution.
    const fifoVariants = [
      `tblFIFOPerfSumByUnderlying${accId}Body`,
      `tblFIFOPerfSumByUnderlying_${accId}Body`,
    ]
    let fifoTableHtml = null
    for (const id of fifoVariants) {
      const re = new RegExp(
        `id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<table[^>]*>([\\s\\S]*?)</table>`,
        'i',
      )
      const m = html.match(re)
      if (m) {
        fifoTableHtml = m[1]
        break
      }
    }
    if (fifoTableHtml) {
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let currentAssetClass = null
      let m
      while ((m = rowRegex.exec(fifoTableHtml)) !== null) {
        const rowInner = m[1] || ''
        // Asset-class header
        const acMatch = rowInner.match(/<td[^>]*class="[^"]*header-asset[^"]*"[^>]*>([\s\S]*?)<\/td>/i)
        if (acMatch) {
          currentAssetClass = stripCell(acMatch[1].replace(/<[^>]+>/g, ''))
          continue
        }
        // Skip subtotal / header rows
        if (/class="[^"]*subtotal/i.test(rowInner)) continue
        const cells = extractTdsPreserveEmpty(`<tr>${rowInner}</tr>`)
        if (cells.length < 13) continue
        const symbol = cells[0]
        if (!symbol || /^(total|\s*$)/i.test(symbol)) continue
        const row = {
          assetClass: currentAssetClass,
          symbol,
          costAdj: parseNum(cells[1]),
          realizedSTProfit: parseNum(cells[2]),
          realizedSTLoss: parseNum(cells[3]),
          realizedLTProfit: parseNum(cells[4]),
          realizedLTLoss: parseNum(cells[5]),
          realizedTotal: parseNum(cells[6]),
          unrealizedSTProfit: parseNum(cells[7]),
          unrealizedSTLoss: parseNum(cells[8]),
          unrealizedLTProfit: parseNum(cells[9]),
          unrealizedLTLoss: parseNum(cells[10]),
          unrealizedTotal: parseNum(cells[11]),
          total: parseNum(cells[12]),
        }
        // Keep the legacy field name for stocks back-compat; new consumers should use fifoRows.
        if (!account.fifoRows) account.fifoRows = []
        account.fifoRows.push(row)
        if (currentAssetClass === 'Stocks') account.realizedUnrealizedStocks.push(row)
      }
    }

    result.accounts.push(account)
  }

  if (result.accounts.length === 0 && !result.accountSummary.length) {
    const singleAcc = html.match(/secNAV_(U\d+)Heading/) || html.match(/tblMtmPerfSumByUnderlying_(U\d+)/)
    if (singleAcc) {
      const id = singleAcc[1]
      if (!accountIds.has(id)) result.accounts.push({ accountId: id, changeInNav: {}, mtmStocks: [], realizedUnrealizedStocks: [] })
    }
  }

  return result
}

/**
 * Deduplicate trades across overlapping statements. Two trades are considered the same
 * if (accountId, symbol, dateTime, quantity, tradePrice) match. This matters when the
 * MULTI file overlaps with an annual file for the same period — we want to keep only
 * one copy so realized P&L isn't double-counted.
 */
function dedupeTrades(trades) {
  const seen = new Map()
  for (const t of trades) {
    const key = `${t.accountId}|${t.symbol}|${t.dateTime}|${t.quantity}|${t.tradePrice}`
    if (!seen.has(key)) seen.set(key, t)
  }
  return Array.from(seen.values())
}

function main() {
  const files = findAllHtml(DATA_DIR)
  console.log('Found', files.length, 'HTML file(s) in', DATA_DIR)
  const statements = files.map((f) => parseOneFile(f))

  // Flatten all trades across statements + dedupe so downstream consumers
  // (seed-outcomes) can work from a single canonical list.
  const allTrades = []
  for (const st of statements) {
    for (const acc of st.accounts) {
      for (const t of acc.trades || []) {
        allTrades.push({ ...t, sourceFile: st.file })
      }
    }
  }
  const uniqueTrades = dedupeTrades(allTrades)
  // Sort chronologically for reproducible output.
  uniqueTrades.sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''))

  const output = {
    generatedAt: new Date().toISOString(),
    statements,
    trades: uniqueTrades,
  }
  const outDir = path.dirname(OUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8')
  console.log('Wrote', OUT_PATH)
  const totalAccounts = statements.reduce((s, st) => s + st.accounts.length, 0)
  const totalMtm = statements.reduce((s, st) => s + st.accounts.reduce((a, ac) => a + ac.mtmStocks.length, 0), 0)
  const closingTrades = uniqueTrades.filter((t) => t.realizedPL != null && t.realizedPL !== 0)
  const totalRealizedPL = closingTrades.reduce((s, t) => s + t.realizedPL, 0)
  console.log(
    'Parsed',
    statements.length,
    'statement(s),',
    totalAccounts,
    'account(s),',
    totalMtm,
    'MTM stock rows,',
    uniqueTrades.length,
    'unique trades (of which',
    closingTrades.length,
    'have non-zero realized P/L, total',
    totalRealizedPL.toFixed(2),
    ')',
  )
}

main()
