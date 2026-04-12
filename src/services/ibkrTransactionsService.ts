import { supabase } from './supabaseClient'

export interface IbkrTransaction {
  id: string
  user_id: string
  tx_date: string
  account: string
  description: string
  transaction_type: string
  symbol: string
  quantity: number | null
  price: number | null
  price_currency: string
  gross_amount: number | null
  commission: number | null
  net_amount: number | null
  created_at: string
}

const TABLE = 'ibkr_transactions'

export async function listIbkrTransactions(opts?: {
  from?: string
  to?: string
  symbol?: string
  transaction_type?: string
  limit?: number
}): Promise<IbkrTransaction[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .order('tx_date', { ascending: false })

  if (opts?.from) q = q.gte('tx_date', opts.from)
  if (opts?.to) q = q.lte('tx_date', opts.to)
  if (opts?.symbol) q = q.eq('symbol', opts.symbol)
  if (opts?.transaction_type) q = q.eq('transaction_type', opts.transaction_type)
  if (opts?.limit != null) q = q.limit(opts.limit)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as IbkrTransaction[]
}
