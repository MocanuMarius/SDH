/**
 * Broker Data Types & Adapters
 *
 * This module bridges goat-fin's financial parsing services with StockDecisionHelper's
 * entry and outcome models. It re-exports key types from goat-fin while defining
 * adapter interfaces specific to trading analytics.
 */

// ============================================================================
// Re-exports from goat-fin (source of truth for parsing)
// ============================================================================

// ProcessedTrade: Individual trade from broker statement (IBKR Flex XML or Activity HTML)
// Fields: tradeDate (YYYY-MM-DD), symbol, assetCategory, buySell, currency, P&L
export type {
  ProcessedTrade as GoatFinProcessedTrade,
  CalculationResult as GoatFinCalculationResult,
  SymbolCalculationResult as GoatFinSymbolCalculationResult,
  CombinedCalculationResults as GoatFinCombinedCalculationResults,
} from '../../../goat-fin/common/services/taxCalculator';

// ProcessedDividend: Individual dividend record from IBKR
// Fields: symbol, reportDate, country, gross/withheld/net in multiple currencies
export type {
  ProcessedDividend as GoatFinProcessedDividend,
  DividendCountrySummary as GoatFinDividendCountrySummary,
} from '../../../goat-fin/common/services/taxCalculator';

// XTB PDF Parser results (portfolio & dividend summaries)
export type {
  XTBParseResult as GoatFinXTBParseResult,
  XTBPortfolioSummary,
  XTBDividendsInterestSummary,
} from '../../../goat-fin/common/services/xtbParser';

// ============================================================================
// StockDecisionHelper-specific Trade Import Type
// ============================================================================

/**
 * Trade data transformed from goat-fin's ProcessedTrade for import into StockDecisionHelper.
 *
 * Represents a single executed trade (buy or sell) from a broker statement, ready to be
 * converted into an Entry + Outcome record in the database.
 */
export interface BrokerTradeImport {
  // Core trade identification
  symbol: string;                    // Ticker symbol (e.g., "AAPL", "GOOGL")
  tradeDate: string;                 // YYYY-MM-DD format
  assetCategory: string;             // "STOCK", "OPTION", "FUTURE", "FOREX", etc.

  // Trade direction
  buySell: 'BUY' | 'SELL';

  // Execution details (optional - from goat-fin's weighted-average calculation)
  quantity?: number;                 // Number of shares/contracts
  tradePrice?: number;               // Price per unit

  // P&L data (from broker or calculated by goat-fin)
  realizedPnlOriginalCurrency: number;  // P&L in trade currency before FX conversion

  // Currency & FX conversion
  currency: string;                  // Trade currency (e.g., "USD", "EUR")
  nExchangeRate: number;             // Rate to convert to base currency (default: to RON)
  nRealizedPnl: number;              // P&L converted to base currency (RON or USD)

  // Geopolitical context (for tax purposes - kept for compatibility)
  country: string;                   // Country of listing/exchange

  // Import provenance
  brokerId?: string;                 // "IBKR", "XTB", etc.
  sourceFile?: string;               // Original file name (e.g., "Flex_XXXXX.xml")
  importedAt: Date;                  // When this record was imported

  // Broker-specific IDs (for deduplication)
  brokerTradeId?: string;            // Unique ID from broker (e.g., IBKR tradeID)
  accountId?: string;                // Account ID from broker

  // Open/Close indicator from IBKR Flex XML — used to distinguish:
  //   BUY  + 'O' → buy   (opening long)
  //   BUY  + 'C' → cover (closing short)
  //   SELL + 'O' → short (opening short)
  //   SELL + 'C' → sell  (closing long)
  // Possible values: 'O', 'C', 'C;O' (partial), undefined (not in source)
  openCloseIndicator?: 'O' | 'C' | 'C;O' | string;

  // Resolved action type after open/close inference. Set by the parser
  // (when openCloseIndicator is present) or by position-tracking fallback.
  // One of: 'buy' | 'sell' | 'short' | 'cover'
  resolvedActionType?: 'buy' | 'sell' | 'short' | 'cover';
}

// ============================================================================
// StockDecisionHelper-specific Dividend Import Type
// ============================================================================

/**
 * Dividend data transformed from goat-fin's ProcessedDividend for import into StockDecisionHelper.
 *
 * Represents income (dividends, interest) received on a holding, ready to be linked to
 * an Entry record or stored as separate income tracking.
 */
export interface BrokerDividendImport {
  // Core dividend identification
  symbol: string;                    // Underlying security
  reportDate: string;                // YYYY-MM-DD format (when dividend was paid)
  country: string;                   // Country of company

  // Income amounts in original currency
  grossBaseCurrency: number;         // Gross dividend before withholding
  withheldBaseCurrency: number;      // Tax withheld by broker
  netBaseCurrency: number;           // Net amount received (gross + withheld if negative)

  // Currency & FX conversion
  currency: string;                  // Original currency of dividend
  nExchangeRate: number;             // Rate to convert to base currency

  // Income amounts in base currency (RON or USD)
  grossRON: number;
  withheldRON: number;
  netRON: number;

  // Import provenance
  brokerId?: string;                 // "IBKR", "XTB", etc.
  sourceFile?: string;               // Original file name
  importedAt: Date;

  // Deduplication flags (from goat-fin's consolidateDuplicateDividends)
  isPotentialDuplicate?: boolean;
  isConsolidatedEntry?: boolean;     // True if this represents multiple originals
}

// ============================================================================
// Parsed Broker Statement (Complete Import Result)
// ============================================================================

/**
 * Complete result of parsing a broker statement file (XML, CSV, or PDF).
 *
 * Contains all trades, dividends, and metadata extracted from the source file,
 * ready for deduplication and import into the database.
 */
export interface ParsedBrokerStatement {
  // Parse status
  success: boolean;
  error?: string;                    // Error message if parsing failed

  // Broker & statement type identification
  broker: 'IBKR' | 'XTB' | 'UNKNOWN';
  statementType: 'FlexReport' | 'ActivityStatement' | 'PdfReport' | 'CsvDividends' | 'Unknown';

  // Parsed data
  trades: BrokerTradeImport[];       // Array of executed trades
  dividends: BrokerDividendImport[]; // Array of received dividends/interest

  // Summary statistics
  rawStats?: {
    totalTradesInFile: number;       // Count of trades in original statement
    totalDividendsInFile: number;    // Count of dividends in original statement
    dateRange?: {                    // Date range of trades/dividends
      start: string;                 // YYYY-MM-DD
      end: string;                   // YYYY-MM-DD
    };
    currency?: string;               // Primary currency of statement
  };
}

// ============================================================================
// Import Result (Database Mutation Result)
// ============================================================================

/**
 * Result of attempting to import trades/dividends from a parsed statement into the database.
 *
 * Tracks how many records were created, skipped, or errored during the import process.
 */
export interface BrokerImportResult {
  importId: string;                  // UUID of broker_imports record
  success: boolean;
  totalProcessed: number;

  trades: {
    createdCount: number;            // New Entry records created
    skippedCount: number;            // Duplicates skipped
    errorCount: number;              // Records that failed to import
    errors: Array<{
      trade: BrokerTradeImport;
      reason: string;
    }>;
  };

  dividends: {
    createdCount: number;
    skippedCount: number;
    errorCount: number;
    errors: Array<{
      dividend: BrokerDividendImport;
      reason: string;
    }>;
  };

  outcomes?: {
    autoCreatedCount: number;        // Auto-created Outcome records for closed trades
    errorCount: number;
  };
}

// ============================================================================
// Broker Import Tracking (Database Schema)
// ============================================================================

/**
 * BrokerImport record stored in database for audit trail and deduplication.
 *
 * Tracks the complete history of statement imports, allowing:
 * - File deduplication via SHA256 hash
 * - Audit trail (who imported what, when)
 * - Re-import capability (original parsed data cached in JSONB)
 */
export interface BrokerImport {
  id: string;                        // UUID
  user_id: string;                   // User who performed import

  broker_name: 'IBKR' | 'XTB' | 'OTHER';
  statement_type: 'FlexReport' | 'ActivityStatement' | 'PdfReport' | 'CsvDividends';

  file_name: string;                 // Original file name
  file_hash: string;                 // SHA256(file content) for deduplication

  imported_at: Date;                 // When import was performed

  trade_count: number;               // Trades in this import
  dividend_count: number;            // Dividends in this import

  status: 'success' | 'partial' | 'failed';
  error_message?: string;

  parsed_data: ParsedBrokerStatement; // Full parsed result (JSONB in DB)

  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Deduplication Key & Strategy
// ============================================================================

/**
 * Trade deduplication key used to identify if a trade already exists in the system.
 *
 * A trade is considered a duplicate if it matches on all of these fields:
 * - Symbol
 * - Trade date
 * - Buy/Sell direction
 * - Quantity
 * - (optional) Broker trade ID for exact match
 */
export interface TradeDeduplicationKey {
  symbol: string;
  tradeDate: string;                 // YYYY-MM-DD
  buySell: 'BUY' | 'SELL';
  quantity?: number;
  brokerTradeId?: string;
}

/**
 * Dividend deduplication key.
 *
 * A dividend is considered a duplicate if it matches on:
 * - Symbol
 * - Report date
 * - Rounded gross amount (within 0.01 units)
 * - Currency
 */
export interface DividendDeduplicationKey {
  symbol: string;
  reportDate: string;                // YYYY-MM-DD
  currency: string;
  roundedGrossAmount: number;        // Rounded to 0.01 for fuzzy matching
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Broker statement file types we support.
 *
 * IBKR Flex XML - Most detailed (quantity, price, cost basis, detailed P&L)
 * IBKR Activity Statement HTML - Alternative format from IBKR
 * IBKR Dividends CSV - Separate income statement from IBKR
 * XTB PDF - Portfolio and dividend reports from XTB broker
 */
export type BrokerStatementFileType =
  | 'ibkr-flex-xml'
  | 'ibkr-activity-html'
  | 'ibkr-dividends-csv'
  | 'xtb-portfolio-pdf'
  | 'xtb-dividends-pdf';

/**
 * Supported asset categories from broker statements.
 * Used for filtering and analytics (e.g., "show only stocks" or "include derivatives").
 */
export type AssetCategory =
  | 'STOCK'
  | 'OPTION'
  | 'FUTURE'
  | 'FOREX'
  | 'CRYPTO'
  | 'ETF'
  | 'BOND'
  | 'DERIVATIVE'
  | 'UNKNOWN';

/**
 * Broker identifiers supported by the import system.
 */
export type BrokerName = 'IBKR' | 'XTB' | 'OTHER';
