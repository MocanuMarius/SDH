/**
 * Types for parsed IBKR Activity Statement summary (from parse-ibkr-activity-html.js).
 */

export interface IbkrAccountSummaryRow {
  account: string
  alias: string
  name: string
  priorNav: number | null
  currentNav: number | null
  twr: string | null
}

export interface IbkrChangeInNavEntry {
  label: string
  value: number | null
}

export interface IbkrMtmStockRow {
  symbol: string
  priorQty: number | null
  currentQty: number | null
  priorPrice: number | null
  currentPrice: number | null
  positionPL: number | null
  transactionPL: number | null
  commissions: number | null
  other: number | null
  total: number | null
}

export interface IbkrRealizedUnrealizedStockRow {
  symbol: string
  costAdj: number | null
  realizedSTProfit: number | null
  realizedSTLoss: number | null
  realizedLTProfit: number | null
  realizedLTLoss: number | null
  realizedTotal: number | null
  unrealizedSTProfit: number | null
  unrealizedSTLoss: number | null
  unrealizedLTProfit: number | null
  unrealizedLTLoss: number | null
  unrealizedTotal: number | null
  total: number | null
}

export interface IbkrActivityAccount {
  accountId: string
  changeInNav: Record<string, IbkrChangeInNavEntry>
  mtmStocks: IbkrMtmStockRow[]
  realizedUnrealizedStocks: IbkrRealizedUnrealizedStockRow[]
}

export interface IbkrActivityStatement {
  file: string
  period: string | null
  accountSummary: IbkrAccountSummaryRow[]
  accounts: IbkrActivityAccount[]
}

export interface IbkrActivitySummaryResponse {
  generatedAt: string
  statements: IbkrActivityStatement[]
}
