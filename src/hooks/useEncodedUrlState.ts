/**
 * useEncodedUrlState — single-blob URL state hook.
 *
 * Wraps react-router's `useSearchParams` with base64-encoded JSON so a
 * whole page's interactive state (ranges, zooms, selections, tabs…)
 * rides on one `?s=<blob>` param instead of a dozen individual keys.
 * Result: shareable links that restore the full view verbatim.
 *
 * Usage pattern — define your page's state shape, pass a stable default,
 * destructure like useState:
 *
 *     type TimelineState = {
 *       range: ChartRange
 *       zoom: [number, number] | null
 *       selectedId: string | null
 *     }
 *     const DEFAULT: TimelineState = { range: '6m', zoom: null, selectedId: null }
 *     const [state, setState] = useEncodedUrlState('s', DEFAULT)
 *     // update partially
 *     setState({ zoom: [10, 42] })
 *     // or via updater
 *     setState((prev) => ({ range: prev.range === '1y' ? '2y' : '1y' }))
 *
 * Everything the page renders keys off `state`; every setter re-encodes
 * and pushes into the URL with `replace: true` so the user's back button
 * still navigates between pages (not between every filter tweak).
 *
 * The `paramKey` argument lets multiple pages share the `?s=` convention
 * or namespace their own (rare — default to `'s'`).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { decodeUrlState, encodeUrlState } from '../utils/urlState'

export function useEncodedUrlState<T extends object>(
  paramKey: string,
  defaultValue: T,
): [T, (update: Partial<T> | ((prev: T) => Partial<T>)) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const encoded = searchParams.get(paramKey)

  // Stable ref to the default — callers commonly pass an inline object and
  // we don't want that to cause re-renders downstream.
  const defaultRef = useRef(defaultValue)

  // Only re-compute when the encoded blob actually changes; defaultRef is
  // stable by design so deliberately omitted.
  const state = useMemo<T>(() => {
    const decoded = decodeUrlState<Partial<T>>(encoded)
    return { ...defaultRef.current, ...(decoded ?? {}) }
  }, [encoded])

  // Mirror `state` into a ref so the setter can read the LATEST value even
  // when called multiple times within a single event handler. Without this,
  // sequential setters each read the stale render-time `searchParams` and
  // the later one overwrites the earlier one's URL update.
  const latestStateRef = useRef(state)
  useEffect(() => {
    latestStateRef.current = state
  }, [state])

  const setState = useCallback(
    (update: Partial<T> | ((prev: T) => Partial<T>)) => {
      const base = latestStateRef.current
      const partial = typeof update === 'function' ? update(base) : update
      const next: T = { ...base, ...partial }

      // If `next` ends up equal to the default, drop the param entirely —
      // keeps the URL clean when the user resets back to defaults.
      const defaultsOnly = JSON.stringify(next) === JSON.stringify(defaultRef.current)
      const nextEncoded = defaultsOnly ? '' : encodeUrlState(next)

      // Update the ref synchronously so the next setter in the same tick
      // sees this change. setSearchParams is async (triggers re-render).
      latestStateRef.current = next

      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (nextEncoded) nextParams.set(paramKey, nextEncoded)
          else nextParams.delete(paramKey)
          return nextParams
        },
        { replace: true },
      )
    },
    [paramKey, setSearchParams],
  )

  return [state, setState]
}
