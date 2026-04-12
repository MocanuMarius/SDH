/**
 * Ambient module declarations for goat-fin package imports.
 *
 * goat-fin is a Next.js TypeScript project in the monorepo that has
 * pre-existing TypeScript warnings (unused variables, etc.) under strict mode.
 * These declarations let us import from goat-fin without TypeScript
 * re-checking those files under StockDecisionHelper's stricter tsconfig.
 */

declare module '../../../goat-fin/common/services/taxCalculator' {
  /** Summary result per country */
  export interface DividendCountrySummary {
    country: string;
    grossRON: number;
    withheldRON: number;
    netRON: number;
    dividendDetails?: Array<{
      symbol: string;
      reportDate: string;
      country: string;
      grossBaseCurrency: number;
      withheldBaseCurrency: number;
      netBaseCurrency: number;
      currency: string;
      nExchangeRate: number;
      grossRON: number;
      withheldRON: number;
      netRON: number;
      isPotentialDuplicate?: boolean;
      isConsolidatedEntry?: boolean;
    }>;
  }

  /** Individual processed trade (after WAVG / FIFO P&L calculation) */
  export interface ProcessedTrade {
    tradeDate: string;
    instrumentDescription: string;
    assetCategory: string;
    currency: string;
    realizedPL_OriginalCurrency: number;
    country: string;
    buySell: string;
    nType: string;
    nExchangeRate: number;
    nRealizedRON: number;
    tradeID?: number | string;
    transactionID?: number;
    transactionType?: string;
    underlyingSymbol?: string;
    putCall?: string;
    settleDateTarget?: string;
    deliveryType?: string;
    quantity?: number;
    tradePrice?: number;
  }

  /** Per-symbol aggregated result */
  export interface SymbolCalculationResult {
    symbol: string;
    trades: ProcessedTrade[];
    nTotalPL_RON: number;
  }

  /** Country-level aggregated result */
  export interface CountryCalculationResult {
    country: string;
    nTotalPL_RON: number;
    symbols: SymbolCalculationResult[];
  }

  /** Top-level return type of calculateTaxesFromXmlStrings */
  export interface CombinedCalculationResults {
    symbolResults: SymbolCalculationResult[];
    countryResults: CountryCalculationResult[];
  }

  /**
   * Calculate P&L taxes from one or more IBKR Flex XML file contents.
   * Uses Romanian WAVG or FIFO method for P&L calculation.
   */
  export function calculateTaxesFromXmlStrings(
    xmlStrings: string[]
  ): Promise<CombinedCalculationResults>;

  /**
   * Parse IBKR dividends CSV and calculate withholding taxes.
   */
  export function calculateDividendsFromCsvString(
    csvString: string,
    manualExchangeRate?: number
  ): Promise<DividendCountrySummary[]>;
}

declare module '../../../goat-fin/common/services/xtbParser' {
  /** XTB portfolio summary (from PDF) */
  export interface XTBPortfolioSummary {
    totalValue: number;
    currency: string;
    reportDate?: string;
  }

  /** XTB dividends/interest summary (from PDF) */
  export interface XTBDividendsInterestSummary {
    totalDividends: number;
    totalInterest: number;
    currency: string;
    reportDate?: string;
  }

  /** XTB parse result from a single PDF */
  export interface XTBParseResult {
    success: boolean;
    error?: string;
    reportType?: 'portfolio' | 'dividends';
    portfolio?: XTBPortfolioSummary;
    dividendsInterest?: XTBDividendsInterestSummary;
  }

  /** Parse a single XTB PDF buffer */
  export function parseXtbPdf(
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<XTBParseResult>;

  /** Merge multiple XTB parse results into one */
  export function mergeXtbResults(results: XTBParseResult[]): XTBParseResult;

  /** Detect whether an XTB PDF is a portfolio or dividends report */
  export function detectXtbReportType(fileName: string): 'portfolio' | 'dividends';
}
