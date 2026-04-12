/**
 * Global context for the quick ticker chart popup.
 * Call openChart(ticker) from anywhere to show a price chart with decisions + benchmark.
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import TickerChartDialog from '../components/TickerChartDialog'

interface TickerChartContextValue {
  openChart: (ticker: string) => void
}

const TickerChartContext = createContext<TickerChartContextValue>({ openChart: () => {} })

export function TickerChartProvider({ children }: { children: ReactNode }) {
  const [ticker, setTicker] = useState<string | null>(null)
  const openChart = useCallback((t: string) => setTicker(t), [])
  const onClose = useCallback(() => setTicker(null), [])
  const value = useMemo<TickerChartContextValue>(() => ({ openChart }), [openChart])
  return (
    <TickerChartContext.Provider value={value}>
      {children}
      <TickerChartDialog ticker={ticker} onClose={onClose} />
    </TickerChartContext.Provider>
  )
}

export function useTickerChart() {
  return useContext(TickerChartContext)
}
