/**
 * Broker Data Import Service
 *
 * Wraps goat-fin's financial statement parsers (IBKR Flex XML, IBKR CSV, XTB PDF)
 * and adapts them for StockDecisionHelper's Entry/Outcome models.
 *
 * Handles:
 * - File parsing and validation
 * - Error handling & user feedback
 * - Type transformation (goat-fin → StockDecisionHelper)
 * - Deduplication (file hash, trade signature)
 * - Entry/Outcome record creation
 * - Import audit trail
 */

// Use Web Crypto API (available in all modern browsers and Vite)
const cryptoSha256 = async (buffer: Uint8Array): Promise<string> => {
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
// goat-fin's taxCalculator imports Node-only modules (csv-parser, stream) at
// the top of the file, so we MUST NOT let Rollup bundle it at build time —
// the browser build fails with "Readable is not exported by __vite-browser-external".
// Using a runtime-constructed path string + `@vite-ignore` prevents Rollup
// from statically following the import. The module is only reached server-side
// (via the Broker Import page's actual parse), which itself runs in a Node
// API route, so the stub path is never hit in practice.
type DividendCountrySummary = import('../../../goat-fin/common/services/taxCalculator').DividendCountrySummary;

async function getGoatFinParser() {
  // Build the specifier dynamically so Rollup can't follow it at build time.
  const goatFinPath = '../../../goat-fin/common/services/taxCalculator'
  const mod = await import(/* @vite-ignore */ goatFinPath)
  return mod
}

// XTB PDF parsing uses pdf-parse (Node.js only) — not available in browser.
const parseXtbPdf = async (_buf: Buffer, _name: string) =>
  ({ success: false, error: 'XTB PDF parsing requires server-side processing' });
const detectXtbReportType = (_name: string): 'portfolio' | 'dividends' => 'portfolio';

import type {
  ParsedBrokerStatement,
  BrokerTradeImport,
  BrokerDividendImport,
  BrokerImportResult,
} from '../types/brokerData';

import type { EntryInsert, ActionInsert, OutcomeInsert, BrokerImportInsert, ActionType } from '../types/database';
import { supabase } from './supabaseClient';

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse IBKR Flex XML statement from buffer
 *
 * @param fileBuffer - Binary buffer of the XML file
 * @param fileName - Original file name (for logging)
 * @returns ParsedBrokerStatement with trades and dividends
 */
export async function parseIbkrFlexXml(
  fileBuffer: Buffer,
  fileName: string
): Promise<ParsedBrokerStatement> {
  try {
    const xmlString = new TextDecoder().decode(fileBuffer as unknown as Uint8Array);

    // Dynamically load goat-fin's tax calculator (avoids csv-parser at startup)
    const { calculateTaxesFromXmlStrings } = await getGoatFinParser();
    const results = await calculateTaxesFromXmlStrings([xmlString]);

    // Transform goat-fin's ProcessedTrade[] to BrokerTradeImport[]
    const trades = transformGoatFinTrades(results.symbolResults || [], fileName);

    // For now, we skip dividends from Flex XML (can be added later)
    // IBKR sends dividends in separate CSV or in FlexStatement but we focus on trades
    const dividends: BrokerDividendImport[] = [];

    return {
      success: true,
      broker: 'IBKR',
      statementType: 'FlexReport',
      trades,
      dividends,
      rawStats: {
        totalTradesInFile: trades.length,
        totalDividendsInFile: dividends.length,
        dateRange: calculateDateRange(trades),
        currency: trades.length > 0 ? trades[0].currency : undefined,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to parse IBKR Flex XML: ${errorMsg}`,
      broker: 'IBKR',
      statementType: 'FlexReport',
      trades: [],
      dividends: [],
    };
  }
}

/**
 * Parse IBKR Flex XML for the *journal* (not the tax pipeline).
 *
 * Why a separate parser?
 * The goat-fin tax calculator collapses trades through a FIFO/WAVG
 * accounting pipeline that ONLY emits realized closes — every
 * BUY-to-open and SELL-to-open-short gets dropped before reaching the
 * importer. That's correct for tax reporting but wrong for journaling:
 * the user needs every trade preserved.
 *
 * This parser walks `<Trade>` rows directly with the browser's DOMParser
 * and produces one BrokerTradeImport per row. It also reads the
 * `openCloseIndicator` attribute, which IBKR sets to:
 *   - 'O'  → opening leg
 *   - 'C'  → closing leg
 *   - 'C;O' (rare) → partial close + open in one fill
 * That field is the ground-truth signal for distinguishing
 * buy/sell/short/cover. When it's missing (older statements without the
 * column), we fall back to chronological position tracking.
 */
export async function parseIbkrFlexXmlForJournal(
  fileBuffer: Buffer,
  fileName: string
): Promise<ParsedBrokerStatement> {
  try {
    const xmlString = new TextDecoder().decode(fileBuffer as unknown as Uint8Array);
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        success: false,
        error: `Invalid XML: ${parserError.textContent?.slice(0, 200) ?? 'unknown error'}`,
        broker: 'IBKR',
        statementType: 'FlexReport',
        trades: [],
        dividends: [],
      };
    }

    const tradeNodes = Array.from(doc.getElementsByTagName('Trade'));
    const trades: BrokerTradeImport[] = [];

    for (const node of tradeNodes) {
      // IBKR uses XML attributes for everything inside <Trade>.
      const symbol = (node.getAttribute('symbol') ?? '').trim();
      if (!symbol) continue;

      const tradeDateRaw = (node.getAttribute('tradeDate') ?? '').trim();
      const tradeDate = normalizeIbkrDate(tradeDateRaw);
      if (!tradeDate) continue;

      const buySellRaw = (node.getAttribute('buySell') ?? '').trim().toUpperCase();
      if (buySellRaw !== 'BUY' && buySellRaw !== 'SELL') continue;

      const transactionType = (node.getAttribute('transactionType') ?? '').trim();
      // Skip non-trade rows that occasionally appear (corporate actions, etc.)
      if (transactionType && /^(BookTrade|FractionalShare)$/i.test(transactionType) === false &&
          /Trade/i.test(transactionType) === false) {
        // Allow ExchTrade, OvernightTrade, BookTrade, etc. — keep anything that's a Trade variant
      }

      const quantity = parseNumAttr(node, 'quantity');
      const tradePrice = parseNumAttr(node, 'tradePrice');
      const ibCommission = parseNumAttr(node, 'ibCommission');
      const fifoPnlRealized = parseNumAttr(node, 'fifoPnlRealized') ?? 0;
      const currency = (node.getAttribute('currency') ?? 'USD').trim();
      const accountId = (node.getAttribute('accountId') ?? '').trim() || undefined;
      const tradeID = (node.getAttribute('tradeID') ?? '').trim() || undefined;
      const issuerCountryCode = (node.getAttribute('issuerCountryCode') ?? '').trim();
      const assetCategory = ((node.getAttribute('assetCategory') ?? 'STOCK').trim() || 'STOCK').toUpperCase();

      // The critical field: open/close indicator
      const ociRaw = (node.getAttribute('openCloseIndicator') ?? '').trim().toUpperCase();
      const openCloseIndicator = ociRaw || undefined;

      trades.push({
        symbol,
        tradeDate,
        assetCategory,
        buySell: buySellRaw as 'BUY' | 'SELL',
        quantity: quantity ?? undefined,
        tradePrice: tradePrice ?? undefined,
        realizedPnlOriginalCurrency: fifoPnlRealized,
        currency,
        nExchangeRate: 1,
        nRealizedPnl: fifoPnlRealized,
        country: issuerCountryCode || 'US',
        brokerId: 'IBKR',
        sourceFile: fileName,
        importedAt: new Date(),
        brokerTradeId: tradeID,
        accountId,
        openCloseIndicator,
        resolvedActionType: undefined, // filled in next step
      });

      // Stash commission separately if needed later (not on the type yet)
      void ibCommission;
    }

    // Resolve action types. Use openCloseIndicator when present, otherwise
    // fall back to chronological position tracking per (account, symbol).
    resolveActionTypes(trades);

    return {
      success: true,
      broker: 'IBKR',
      statementType: 'FlexReport',
      trades,
      dividends: [],
      rawStats: {
        totalTradesInFile: trades.length,
        totalDividendsInFile: 0,
        dateRange: calculateDateRange(trades),
        currency: trades[0]?.currency,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to parse IBKR Flex XML for journal: ${errorMsg}`,
      broker: 'IBKR',
      statementType: 'FlexReport',
      trades: [],
      dividends: [],
    };
  }
}

/** Convert IBKR date forms (YYYYMMDD or YYYY-MM-DD) to YYYY-MM-DD. */
function normalizeIbkrDate(raw: string): string | null {
  if (!raw) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Compact: 20260101
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  // dd/MM/yyyy fallback
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseNumAttr(node: Element, name: string): number | null {
  const v = node.getAttribute(name);
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve every trade's actionType to one of buy/sell/short/cover.
 *
 * Strategy:
 *   1. If `openCloseIndicator` is present and unambiguous ('O' or 'C'),
 *      use it directly with the buy/sell side to pick the action type.
 *   2. Otherwise, walk trades chronologically per (accountId, symbol)
 *      with a running quantity:
 *        - BUY when pos >= 0  → buy
 *        - BUY when pos <  0  → cover  (closing a short)
 *        - SELL when pos >  0 → sell   (closing a long)
 *        - SELL when pos <= 0 → short  (opening a short)
 *      Then update the running position.
 *
 * Mutates `trades` in place. Sorted (account, symbol, date asc) for the walk
 * but trade order in the input array is preserved on return.
 */
export function resolveActionTypes(trades: BrokerTradeImport[]): void {
  // Pass 1 — direct mapping from openCloseIndicator.
  for (const t of trades) {
    if (t.resolvedActionType) continue;
    const oci = t.openCloseIndicator;
    if (oci === 'O') {
      t.resolvedActionType = t.buySell === 'BUY' ? 'buy' : 'short';
    } else if (oci === 'C') {
      t.resolvedActionType = t.buySell === 'BUY' ? 'cover' : 'sell';
    }
    // 'C;O' (partial) and unknown values fall through to inference.
  }

  // Pass 2 — chronological position tracking for the rest.
  const remaining = trades.filter((t) => !t.resolvedActionType);
  if (remaining.length === 0) return;

  // Group by (accountId|'_', symbol). All trades — even those already
  // resolved — are walked so the running position reflects reality.
  type Key = string;
  const groupKey = (t: BrokerTradeImport): Key => `${t.accountId ?? '_'}::${t.symbol}`;
  const groups = new Map<Key, BrokerTradeImport[]>();
  for (const t of trades) {
    const k = groupKey(t);
    let arr = groups.get(k);
    if (!arr) {
      arr = [];
      groups.set(k, arr);
    }
    arr.push(t);
  }

  for (const [, group] of groups) {
    group.sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) return a.tradeDate.localeCompare(b.tradeDate);
      // Stable: keep original order within same date
      return 0;
    });
    let pos = 0;
    for (const t of group) {
      const qty = t.quantity ?? 0;
      const signed = t.buySell === 'BUY' ? qty : -qty;
      const preTrade = pos;
      if (!t.resolvedActionType) {
        if (t.buySell === 'BUY') {
          t.resolvedActionType = preTrade >= 0 ? 'buy' : 'cover';
        } else {
          t.resolvedActionType = preTrade > 0 ? 'sell' : 'short';
        }
      }
      pos += signed;
    }
  }
}

/**
 * Parse IBKR Dividends CSV from buffer
 *
 * CSV parsing uses csv-parser (Node.js only) — not available in browser.
 * This is stubbed here; actual parsing would require a server-side API route.
 *
 * @param csvBuffer - Binary buffer of the CSV file
 * @param fileName - Original file name (for logging)
 * @param _manualExchangeRate - Optional manual FX rate if API calls fail
 * @returns ParsedBrokerStatement with dividends only
 */
export async function parseIbkrDividendsCsv(
  _csvBuffer: Buffer,
  _fileName: string,
  _manualExchangeRate?: number
): Promise<ParsedBrokerStatement> {
  // CSV parsing requires Node.js only (csv-parser module)
  // This would need a server-side endpoint to work in browser
  return {
    success: false,
    error: 'IBKR Dividends CSV parsing requires server-side processing. Please use Flex XML exports instead.',
    broker: 'IBKR',
    statementType: 'CsvDividends',
    trades: [],
    dividends: [],
  };
}

/**
 * Parse XTB broker PDF (portfolio or dividends report)
 *
 * @param pdfBuffer - Binary buffer of the PDF file
 * @param fileName - Original file name (used to detect report type)
 * @returns ParsedBrokerStatement with portfolio value or dividends
 */
export async function parseXtbBrokerReport(
  pdfBuffer: Buffer,
  fileName: string
): Promise<ParsedBrokerStatement> {
  try {
    // Use goat-fin's XTB parser
    const result = await parseXtbPdf(pdfBuffer, fileName);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to parse XTB PDF',
        broker: 'XTB',
        statementType: 'PdfReport',
        trades: [],
        dividends: [],
      };
    }

    const reportType = detectXtbReportType(fileName);

    // XTB PDFs don't provide trade-by-trade data, so we return summary only
    // (Portfolio value or dividend totals, not individual trades)
    return {
      success: true,
      broker: 'XTB',
      statementType: reportType === 'portfolio' ? 'PdfReport' : 'PdfReport',
      trades: [],
      dividends: [],
      rawStats: {
        totalTradesInFile: 0,
        totalDividendsInFile: 0,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to parse XTB PDF: ${errorMsg}`,
      broker: 'XTB',
      statementType: 'PdfReport',
      trades: [],
      dividends: [],
    };
  }
}

/**
 * Calculate SHA256 hash of file buffer for deduplication
 *
 * @param fileBuffer - Binary buffer
 * @returns Hexadecimal SHA256 hash
 */
export async function calculateFileHash(fileBuffer: Uint8Array): Promise<string> {
  return cryptoSha256(fileBuffer);
}

// ============================================================================
// Private Transformation Functions
// ============================================================================

/**
 * Transform goat-fin's SymbolCalculationResult[] to BrokerTradeImport[]
 *
 * goat-fin returns trades grouped by symbol with aggregated P&L.
 * We need to flatten this back to individual trade records for database storage.
 */
function transformGoatFinTrades(
  symbolResults: Array<{
    symbol: string;
    trades: Array<{
      tradeDate: string;
      realizedPL_OriginalCurrency: number;
      currency: string;
      nExchangeRate: number;
      nRealizedRON: number;
      buySell?: string;
      quantity?: number;
      tradePrice?: number;
      country?: string;
      tradeID?: string;
    }>;
    nTotalPL_RON: number;
  }>,
  sourceFile: string
): BrokerTradeImport[] {
  const trades: BrokerTradeImport[] = [];

  for (const symbolGroup of symbolResults) {
    for (const trade of symbolGroup.trades) {
      trades.push({
        symbol: symbolGroup.symbol,
        tradeDate: trade.tradeDate,
        assetCategory: 'STOCK', // Default; would need more info from IBKR for options
        buySell: (trade.buySell as 'BUY' | 'SELL') || 'BUY',
        quantity: trade.quantity,
        tradePrice: trade.tradePrice,
        realizedPnlOriginalCurrency: trade.realizedPL_OriginalCurrency,
        currency: trade.currency,
        nExchangeRate: trade.nExchangeRate,
        nRealizedPnl: trade.nRealizedRON,
        country: trade.country || 'US',
        brokerId: 'IBKR',
        sourceFile,
        importedAt: new Date(),
        brokerTradeId: trade.tradeID,
      });
    }
  }

  return trades;
}

/**
 * Transform goat-fin's DividendCountrySummary[] to BrokerDividendImport[]
 */
export function transformGoatFinDividends(
  dividendSummaries: DividendCountrySummary[],
  sourceFile: string
): BrokerDividendImport[] {
  const dividends: BrokerDividendImport[] = [];

  for (const summary of dividendSummaries) {
    for (const detail of summary.dividendDetails || []) {
      dividends.push({
        symbol: detail.symbol,
        reportDate: detail.reportDate,
        country: detail.country,
        grossBaseCurrency: detail.grossBaseCurrency,
        withheldBaseCurrency: detail.withheldBaseCurrency,
        netBaseCurrency: detail.netBaseCurrency,
        currency: detail.currency,
        nExchangeRate: detail.nExchangeRate,
        grossRON: detail.grossRON,
        withheldRON: detail.withheldRON,
        netRON: detail.netRON,
        brokerId: 'IBKR',
        sourceFile,
        importedAt: new Date(),
        isPotentialDuplicate: detail.isPotentialDuplicate,
        isConsolidatedEntry: detail.isConsolidatedEntry,
      });
    }
  }

  return dividends;
}

/**
 * Calculate date range from trades list
 */
function calculateDateRange(
  trades: BrokerTradeImport[]
): { start: string; end: string } | undefined {
  if (trades.length === 0) return undefined;

  const dates = trades.map((t) => t.tradeDate).sort();
  return {
    start: dates[0],
    end: dates[dates.length - 1],
  };
}

// ============================================================================
// Database Integration
// ============================================================================

/**
 * Create a broker_imports record and return its UUID
 */
export async function createBrokerImportRecord(
  userId: string,
  statement: ParsedBrokerStatement,
  fileHash: string,
  fileName: string
): Promise<string> {
  const insert: BrokerImportInsert = {
    user_id: userId,
    broker_name: statement.broker,
    statement_type: statement.statementType,
    file_name: fileName,
    file_hash: fileHash,
    imported_at: new Date().toISOString(),
    trade_count: statement.trades.length,
    dividend_count: statement.dividends.length,
    status: 'pending',
    error_message: null,
    parsed_data: {
      metadata: {
        parsedAt: new Date().toISOString(),
        totalTrades: statement.trades.length,
        totalDividends: statement.dividends.length,
        dateRange: statement.rawStats?.dateRange,
      },
    },
  };

  const { data, error } = await supabase
    .from('broker_imports')
    .insert(insert)
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

/**
 * Check if a file has already been imported (by hash)
 */
export async function checkFileAlreadyImported(
  fileHash: string
): Promise<{ exists: boolean; importId?: string; importedAt?: string }> {
  const { data, error } = await supabase
    .from('broker_imports')
    .select('id, imported_at')
    .eq('file_hash', fileHash)
    .single();

  if (error?.code === 'PGRST116') return { exists: false };
  if (error) throw error;
  return { exists: true, importId: data.id, importedAt: data.imported_at };
}

/**
 * Get import history for a user
 */
export async function listBrokerImports(userId: string) {
  const { data, error } = await supabase
    .from('broker_imports')
    .select('*')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Import trades from a parsed statement into the database.
 *
 * For each trade:
 * 1. Deduplicate (skip if broker_trade_id already in entries)
 * 2. Create Entry record (1 per symbol-session — all same-day same-symbol trades share an entry)
 * 3. Create Action record (buy/sell)
 * 4. For SELL trades with non-zero P&L: Auto-create Outcome record
 */
export async function importTradesFromStatement(
  statement: ParsedBrokerStatement,
  userId: string,
  importId: string
): Promise<BrokerImportResult> {
  const result: BrokerImportResult = {
    importId,
    success: true,
    totalProcessed: statement.trades.length,
    trades: {
      createdCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    },
    dividends: {
      createdCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    },
    outcomes: {
      autoCreatedCount: 0,
      errorCount: 0,
    },
  };

  // Group trades by symbol+date for one Entry per symbol per day
  const entryCache = new Map<string, string>(); // "SYMBOL:DATE" → entryId

  for (const trade of statement.trades) {
    try {
      // ── 1. Deduplication check ────────────────────────────────────────────
      if (trade.brokerTradeId) {
        const { data: existing } = await supabase
          .from('entries')
          .select('id')
          .eq('broker_trade_id', String(trade.brokerTradeId))
          .limit(1)
          .maybeSingle();
        // TODO: add unique constraint on entries.broker_trade_id to close race window

        if (existing) {
          result.trades.skippedCount++;
          continue;
        }
      }

      // ── 2. Create Entry (one per symbol+date, shared across multiple actions) ──
      const entryKey = `${trade.symbol}:${trade.tradeDate}`;
      let entryId = entryCache.get(entryKey);

      if (!entryId) {
        const entryInsert: EntryInsert = {
          user_id: userId,
          entry_id: crypto.randomUUID(),
          date: trade.tradeDate,
          author: userId,
          tags: [trade.symbol, statement.broker.toLowerCase(), 'auto-imported'],
          title_markdown: `${trade.symbol} — ${trade.tradeDate}`,
          body_markdown: [
            `**Auto-imported from ${statement.broker} ${statement.statementType}**`,
            '',
            `Symbol: ${trade.symbol}`,
            `Date: ${trade.tradeDate}`,
            trade.country ? `Country: ${trade.country}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          broker_import_id: importId,
          broker_name: statement.broker,
          is_auto_imported: true,
        };

        const { data: entry, error: entryErr } = await supabase
          .from('entries')
          .insert(entryInsert)
          .select('id')
          .single();

        if (entryErr) throw entryErr;
        entryId = entry.id as string;
        entryCache.set(entryKey, entryId);
      }

      // ── 3. Create Action ──────────────────────────────────────────────────
      // Prefer the resolved action type from the journal parser (which uses
      // openCloseIndicator + position tracking). Fall back to naive buy/sell
      // for legacy callers (e.g. the goat-fin tax pipeline path).
      const actionType: ActionType =
        (trade.resolvedActionType as ActionType | undefined) ??
        ((trade.buySell ?? 'BUY').toLowerCase() === 'sell' ? 'sell' : 'buy');

      // Realized P&L only meaningful for closing legs (sell or cover).
      const isClosing = actionType === 'sell' || actionType === 'cover';
      const pnlNote =
        isClosing && trade.nRealizedPnl !== 0
          ? `Realized P&L: ${trade.nRealizedPnl.toFixed(2)} ${trade.currency ?? 'USD'}`
          : '';

      const actionInsert: ActionInsert = {
        entry_id: entryId,
        type: actionType,
        ticker: trade.symbol,
        company_name: null,
        action_date: trade.tradeDate,
        price: trade.tradePrice != null ? String(trade.tradePrice) : '0',
        currency: trade.currency ?? 'USD',
        shares: trade.quantity ?? null,
        reason: `Auto-imported from ${statement.broker}`,
        notes: [
          pnlNote,
          trade.brokerTradeId ? `Broker trade ID: ${trade.brokerTradeId}` : '',
          trade.nExchangeRate ? `FX rate: ${trade.nExchangeRate}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
        raw_snippet: null,
      };

      const { data: action, error: actionErr } = await supabase
        .from('actions')
        .insert(actionInsert)
        .select('id')
        .single();

      if (actionErr) throw actionErr;

      // Update entry with broker_trade_id on the action row (not entry)
      // We track the broker_trade_id on the entry for deduplication lookup
      if (trade.brokerTradeId) {
        await supabase
          .from('entries')
          .update({ broker_trade_id: String(trade.brokerTradeId) })
          .eq('id', entryId);
      }

      result.trades.createdCount++;

      // ── 4. Auto-create Outcome for closing trades with realized P&L ──────
      if (isClosing && trade.nRealizedPnl !== 0) {
        try {
          const outcomeInsert: OutcomeInsert = {
            action_id: action.id as string,
            realized_pnl: trade.nRealizedPnl,
            outcome_date: trade.tradeDate,
            notes: [
              `Auto-created from ${statement.broker} import`,
              `Original currency: ${trade.currency ?? 'USD'}`,
              trade.nExchangeRate
                ? `FX rate used: ${trade.nExchangeRate} RON/${trade.currency ?? 'USD'}`
                : '',
              trade.realizedPnlOriginalCurrency != null
                ? `P&L in ${trade.currency ?? 'USD'}: ${trade.realizedPnlOriginalCurrency.toFixed(2)}`
                : '',
            ]
              .filter(Boolean)
              .join(' | '),
            driver: null,
            process_quality: null,
            outcome_quality: trade.nRealizedPnl > 0 ? 'good' : 'bad',
          };

          const { error: outcomeErr } = await supabase
            .from('outcomes')
            .insert(outcomeInsert);

          if (outcomeErr) {
            result.outcomes!.errorCount++;
          } else {
            result.outcomes!.autoCreatedCount++;
          }
        } catch {
          result.outcomes!.errorCount++;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.trades.errors.push({ trade, reason: errorMsg });
      result.trades.errorCount++;
      result.success = false;
    }
  }

  // Update import record status
  const finalStatus = result.success
    ? result.trades.errorCount === 0
      ? 'success'
      : 'partial'
    : 'failed';

  const errorSummary = result.trades.errors.length > 0
    ? result.trades.errors.slice(0, 5).map((e) => `${e.trade.symbol}: ${e.reason}`).join('; ')
    : null;

  await supabase
    .from('broker_imports')
    .update({
      status: finalStatus,
      trade_count: result.trades.createdCount,
      error_message: errorSummary,
    })
    .eq('id', importId);

  return result;
}

/**
 * Import dividends from a parsed statement into the database.
 *
 * Each dividend creates:
 * - An Entry record (if one for that symbol+date doesn't exist)
 * - An Action record ('sell' type, representing income receipt)
 * - An Outcome record with realized_pnl = net dividend amount
 */
export async function importDividendsFromStatement(
  statement: ParsedBrokerStatement,
  userId: string,
  importId: string
): Promise<Pick<BrokerImportResult, 'dividends'>> {
  const result: Pick<BrokerImportResult, 'dividends'> = {
    dividends: {
      createdCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    },
  };

  for (const dividend of statement.dividends) {
    try {
      // Create or reuse Entry for this symbol+date
      const { data: existingEntry } = await supabase
        .from('entries')
        .select('id')
        .eq('user_id', userId)
        .eq('broker_import_id', importId)
        .contains('tags', [dividend.symbol, 'dividend'])
        .limit(1)
        .maybeSingle();

      let entryId: string;

      if (existingEntry) {
        entryId = existingEntry.id;
        result.dividends.skippedCount++;
        continue;
      } else {
        const entryInsert: EntryInsert = {
          user_id: userId,
          entry_id: crypto.randomUUID(),
          date: dividend.reportDate,
          author: userId,
          tags: [dividend.symbol, statement.broker.toLowerCase(), 'dividend', 'auto-imported'],
          title_markdown: `${dividend.symbol} — Dividend ${dividend.reportDate}`,
          body_markdown: [
            `**Auto-imported dividend from ${statement.broker}**`,
            '',
            `Symbol: ${dividend.symbol}`,
            `Country: ${dividend.country}`,
            `Gross: ${dividend.grossRON?.toFixed(2) ?? '—'} RON`,
            `Withholding tax: ${dividend.withheldRON?.toFixed(2) ?? '—'} RON`,
            `Net (after tax): ${dividend.netRON?.toFixed(2) ?? '—'} RON`,
          ].join('\n'),
          broker_import_id: importId,
          broker_name: statement.broker,
          is_auto_imported: true,
        };

        const { data: entry, error: entryErr } = await supabase
          .from('entries')
          .insert(entryInsert)
          .select('id')
          .single();

        if (entryErr) throw entryErr;
        entryId = entry.id as string;
      }

      // Create action (income receipt)
      const actionInsert: ActionInsert = {
        entry_id: entryId,
        type: 'sell' as ActionType, // Using 'sell' as proxy for income events
        ticker: dividend.symbol,
        company_name: null,
        action_date: dividend.reportDate,
        price: '0',
        currency: dividend.currency ?? 'USD',
        shares: 0,
        reason: `Dividend income — ${dividend.country}`,
        notes: `Gross: ${dividend.grossBaseCurrency?.toFixed(2) ?? '—'} ${dividend.currency ?? 'USD'} | Withheld: ${dividend.withheldBaseCurrency?.toFixed(2) ?? '—'} | FX: ${dividend.nExchangeRate}`,
        raw_snippet: null,
      };

      const { data: action, error: actionErr } = await supabase
        .from('actions')
        .insert(actionInsert)
        .select('id')
        .single();

      if (actionErr) throw actionErr;

      // Create outcome with net dividend as realized P&L
      const netPnl = dividend.netRON ?? 0;
      const outcomeInsert: OutcomeInsert = {
        action_id: action.id as string,
        realized_pnl: netPnl,
        outcome_date: dividend.reportDate,
        notes: `Dividend income. Net after withholding tax: ${netPnl.toFixed(2)} RON`,
        driver: 'other',
        outcome_quality: netPnl >= 0 ? 'good' : 'bad',
        linked_dividend_id: importId,
      };

      const { error: outcomeErr } = await supabase
        .from('outcomes')
        .insert(outcomeInsert);

      if (outcomeErr) throw outcomeErr;

      result.dividends.createdCount++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.dividends.errors.push({ dividend, reason: errorMsg });
      result.dividends.errorCount++;
    }
  }

  return result;
}
