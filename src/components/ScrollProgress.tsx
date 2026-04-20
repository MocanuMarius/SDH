/**
 * ScrollProgress — a thin 2px bar that fills left-to-right as the
 * reader scrolls through the page. Pen-stroke metaphor: the ink
 * lays down as the story unfolds.
 *
 * Placement: fixed to the top of the viewport, below the AppBar
 * (top: 56px on mobile, 60px on desktop). Primary-color with a
 * subtle alpha; stays out of the way but gives constant orientation
 * on long reads (entry body, per-ticker timeline).
 *
 * Uses CSS scroll-driven animations (animation-timeline: scroll())
 * where supported, with a tiny rAF fallback so older browsers still
 * get the effect.
 */

import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { prefersReducedMotion } from '../utils/motion'

export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    // If the browser supports animation-timeline: scroll(), the CSS
    // handles the bar's scaleX and no JS is needed. Detect via
    // CSS.supports and bail if so.
    if (typeof window.CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()')) return
    const el = ref.current
    if (!el) return
    let raf = 0
    const tick = () => {
      raf = 0
      const scroll = window.scrollY
      const height = document.documentElement.scrollHeight - window.innerHeight
      const pct = height > 0 ? Math.min(1, Math.max(0, scroll / height)) : 0
      el.style.transform = `scaleX(${pct})`
    }
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <Box
      ref={ref}
      aria-hidden
      sx={{
        position: 'fixed',
        top: { xs: 56, sm: 60 },
        left: 0,
        right: 0,
        height: 2,
        pointerEvents: 'none',
        zIndex: (t) => t.zIndex.appBar - 1,
        bgcolor: 'primary.main',
        opacity: 0.7,
        transformOrigin: 'left center',
        transform: 'scaleX(0)',
        // Browsers with scroll-driven animations do it natively — no
        // JS, no jank, GPU-accelerated. The JS fallback below handles
        // everyone else with a small rAF-debounced listener.
        '@supports (animation-timeline: scroll())': {
          animation: 'scroll-progress linear both',
          animationTimeline: 'scroll()',
          animationRangeStart: '0%',
          animationRangeEnd: '100%',
        },
        '@keyframes scroll-progress': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        '@media (prefers-reduced-motion: reduce)': { display: 'none' },
      }}
    />
  )
}
