/**
 * useCyclingPlaceholder — returns a placeholder string that cycles
 * through a list of hints at a slow, non-distracting cadence.
 *
 * Used on search fields where a static "Search…" placeholder buries
 * the range of things the user can actually search for. Cycling the
 * hint across "ticker", "tag", "company name" etc. teaches the
 * feature without a tooltip.
 *
 * Pauses when the field is focused (stable hint while typing) and
 * respects `prefers-reduced-motion` by locking to the first hint.
 *
 * Usage:
 *   const placeholder = useCyclingPlaceholder([
 *     'Search by ticker…',
 *     'Search by tag…',
 *     'Search by company…',
 *   ], { intervalMs: 2800 })
 */

import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../utils/motion'

export interface CyclingPlaceholderOpts {
  /** Cadence in ms. Default 2800. */
  intervalMs?: number
  /** When true, the cycling pauses (e.g. while field is focused). */
  paused?: boolean
}

export function useCyclingPlaceholder(
  hints: string[],
  { intervalMs = 2800, paused = false }: CyclingPlaceholderOpts = {},
): string {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (paused) return
    if (prefersReducedMotion()) return
    if (hints.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % hints.length), intervalMs)
    return () => clearInterval(t)
  }, [paused, hints.length, intervalMs])
  return hints[idx] ?? hints[0] ?? ''
}
