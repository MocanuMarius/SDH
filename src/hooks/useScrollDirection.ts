/**
 * useScrollDirection — returns 'up' | 'down' | 'idle' based on the
 * user's most recent meaningful scroll gesture.
 *
 * Used to auto-hide the AppBar on scroll-down and restore it on
 * scroll-up (mobile), a now-common editorial pattern that reclaims
 * vertical space while still giving the reader a one-finger way back
 * to the chrome. Threshold + debounce tuned to avoid flicker on
 * rubber-band / momentum scrolling.
 *
 * `threshold` (px): minimum distance between reads before we
 *   commit to a direction change. 8px feels right on iOS — smaller
 *   numbers flicker, larger numbers feel sticky.
 *
 * The hook doesn't cause any re-renders unless the direction bucket
 * flips. Safe to use at the top of a fixed-element component.
 */

import { useEffect, useState } from 'react'

export type ScrollDirection = 'up' | 'down' | 'idle'

export function useScrollDirection(threshold = 8): ScrollDirection {
  const [dir, setDir] = useState<ScrollDirection>('idle')
  useEffect(() => {
    let lastY = window.scrollY
    let raf = 0
    const tick = () => {
      const y = window.scrollY
      const dy = y - lastY
      if (Math.abs(dy) < threshold) return
      // Keep the chrome visible near the top of the page so the user
      // always has access after pulling back up to look at the header.
      if (y < 40) {
        setDir((prev) => (prev === 'up' ? prev : 'up'))
      } else if (dy > 0) {
        setDir((prev) => (prev === 'down' ? prev : 'down'))
      } else {
        setDir((prev) => (prev === 'up' ? prev : 'up'))
      }
      lastY = y
    }
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        tick()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [threshold])
  return dir
}
