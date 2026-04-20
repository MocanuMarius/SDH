/**
 * AnimatedNumber — ticks up from 0 to `value` over ~600ms on mount.
 *
 * Used for analytics hero stats (Win rate, Total decisions, etc.) so
 * landing on /analytics feels like the page is "catching up" on your
 * data rather than printing a static fact. The animation is short —
 * long enough for the eye to catch, short enough to not read as
 * sluggish.
 *
 * Behaviour:
 *   - `value` changes between renders → re-animate from the previous
 *     value to the new one. Makes live-update reflection legible
 *     ("Win rate just jumped 3%!").
 *   - `prefers-reduced-motion` → render the final value instantly.
 *   - Integer values (no `decimals`) tween as integers; decimals
 *     tween as floats with fixed precision.
 *
 * Usage:
 *   <AnimatedNumber value={45.6} suffix="%" decimals={1} />
 *   <AnimatedNumber value={322}  suffix=" decisions" />
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion, EASE_OUT } from '../utils/motion'

export interface AnimatedNumberProps {
  value: number
  /** Tween duration in ms. Default 600. */
  duration?: number
  /** Digits after the decimal. 0 = integer. Default 0. */
  decimals?: number
  /** Text appended after the number (e.g. "%", " trades"). */
  suffix?: string
  /** Text prepended before the number (e.g. "$"). */
  prefix?: string
}

function easeOut(t: number): number {
  // Same cubic-bezier shape as the rest of the app's motion — values
  // close to [0.22, 1, 0.36, 1]. Approximated as a simple poly so
  // there's no dep on an easing lib just for one component.
  void EASE_OUT
  return 1 - Math.pow(1 - t, 3)
}

function format(n: number, decimals: number, prefix?: string, suffix?: string): string {
  const body = decimals === 0
    ? Math.round(n).toLocaleString()
    : n.toFixed(decimals)
  return `${prefix ?? ''}${body}${suffix ?? ''}`
}

export default function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  suffix,
  prefix,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(() => prefersReducedMotion() ? value : 0)
  const fromRef = useRef(display)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value)
      return
    }
    fromRef.current = display
    startRef.current = null
    let raf: number
    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t
      const elapsed = t - startRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOut(progress)
      const current = fromRef.current + (value - fromRef.current) * eased
      setDisplay(current)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // We intentionally don't depend on `display` — it's the running
    // state the tween mutates. Re-tween only when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return <>{format(display, decimals, prefix, suffix)}</>
}
