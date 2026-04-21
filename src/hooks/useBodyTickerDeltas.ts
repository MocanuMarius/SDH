/**
 * Derive "since-entry" price deltas for every ticker mentioned in
 * an entry's body. Powers the gutter-annotation feature on the
 * entry detail reading column — every $TICKER mention lights up
 * with a live "+4.2% since" reference in the right margin.
 *
 * For each unique ticker:
 *   - Fetch 5-year chart data (cached in-session by chartApiService)
 *   - Find the last close on or before `entryDate` → `priceAtEntry`
 *   - Take the most recent close                       → `currentPrice`
 *   - Compute (current − entry) / entry * 100          → `pct`
 *
 * Failures (network error, unsupported symbol) land as a `null`-
 * valued TickerDelta rather than throwing — the UI then renders
 * a muted "—" instead of an annotation, so a single bad symbol
 * doesn't take out the whole gutter.
 *
 * Keyed on the tickers + entryDate so navigating to another entry
 * with different tickers re-runs cleanly. The underlying chart
 * service already in-session-caches per symbol+range, so repeat
 * renders of the same entry cost nothing.
 */

import { useEffect, useState } from 'react'
import { fetchChartData } from '../services/chartApiService'

export interface TickerDelta {
  /** Closing price on (or the last trading day before) the entry's date. */
  priceAtEntry: number | null
  /** Most recent close in the fetched chart series. */
  currentPrice: number | null
  /** % change from priceAtEntry → currentPrice. null when either price is missing. */
  pct: number | null
}

function findClosestPriceOnOrBefore(
  dates: string[],
  prices: number[],
  targetDate: string
): number | null {
  if (dates.length === 0 || prices.length === 0) return null
  // Dates are returned ascending by the chart API. Walk forward
  // and track the latest index whose date is ≤ target. Break as
  // soon as we overshoot — O(n), but n ≤ ~1300 for 5y daily data.
  let best: number | null = null
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= targetDate) {
      best = prices[i]
    } else {
      break
    }
  }
  // Fallback: entry is older than the chart's coverage — take the
  // earliest price we have so we still render *something* rather
  // than leave the writer staring at "—".
  return best ?? prices[0] ?? null
}

export function useBodyTickerDeltas(
  tickers: string[],
  entryDate: string | undefined | null
): Map<string, TickerDelta> {
  const [deltas, setDeltas] = useState<Map<string, TickerDelta>>(new Map())
  // Primitive-key memoization so the effect only re-runs when the
  // set of tickers or the entry date actually changes.
  const tickersKey = tickers.slice().sort().join(',')

  useEffect(() => {
    if (!entryDate || tickers.length === 0) {
      setDeltas(new Map())
      return
    }
    let cancelled = false
    const scratch = new Map<string, TickerDelta>()

    Promise.all(
      tickers.map((t) =>
        fetchChartData(t, '5y')
          .then((data) => {
            if (cancelled) return
            const currentPrice = data.prices[data.prices.length - 1] ?? null
            const priceAtEntry = findClosestPriceOnOrBefore(data.dates, data.prices, entryDate)
            const pct =
              currentPrice != null && priceAtEntry != null && priceAtEntry > 0
                ? ((currentPrice - priceAtEntry) / priceAtEntry) * 100
                : null
            scratch.set(t, { priceAtEntry, currentPrice, pct })
          })
          .catch(() => {
            if (cancelled) return
            scratch.set(t, { priceAtEntry: null, currentPrice: null, pct: null })
          })
      )
    ).then(() => {
      if (!cancelled) setDeltas(new Map(scratch))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, entryDate])

  return deltas
}
