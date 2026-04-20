/**
 * PullToRefresh — wrap scrollable content to add a pull-down-to-
 * refresh gesture with an editorial look: serif italic label, soft
 * rotation of the refresh glyph tied to pull progress, newspaper
 * dashed hairline below the indicator row. Collapses to a plain
 * wrapper on desktop + when prefers-reduced-motion is set.
 *
 * Gesture rules:
 *  - Only armed when the page is already scrolled to the very top.
 *  - Drag-up disarms.
 *  - Scroll-while-pulling disarms (so it doesn't fight native scroll).
 *  - Release past `PULL_THRESHOLD` fires onRefresh; otherwise snaps
 *    back to zero with the same ease as a released rubber band.
 */

import { useRef, useState, useCallback } from 'react'
import { Box, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { prefersReducedMotion } from '../utils/motion'

interface PullToRefreshProps {
  children: React.ReactNode
  onRefresh: () => Promise<void>
}

const PULL_THRESHOLD = 72
const MAX_PULL = 140
const RESISTANCE = 0.45

export default function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const reduced = typeof window !== 'undefined' && prefersReducedMotion()

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (reduced) return
    if (window.scrollY > 5) return
    startY.current = e.touches[0].clientY
    isPulling.current = true
  }, [reduced])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) { isPulling.current = false; setPullDistance(0); return }
    if (window.scrollY > 2) { isPulling.current = false; setPullDistance(0); return }
    setPullDistance(Math.min(MAX_PULL, dy * RESISTANCE))
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return
    isPulling.current = false
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD * 0.7)
      try { await onRefresh() } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, refreshing, onRefresh])

  const visible = pullDistance > 0 || refreshing
  const armed = pullDistance >= PULL_THRESHOLD
  const rotation = refreshing ? 0 : Math.min(360, (pullDistance / PULL_THRESHOLD) * 360)

  return (
    <Box
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      sx={{ position: 'relative' }}
    >
      {/* Pull indicator — grows with the drag, flips label + colour
          once the user is past threshold. */}
      {visible && (
        <Box
          aria-hidden
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            pb: 0.5,
            height: pullDistance,
            overflow: 'hidden',
            transition: refreshing || pullDistance === 0
              ? 'height 220ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
            color: armed ? 'primary.dark' : 'text.secondary',
            opacity: Math.min(1, pullDistance / 16),
            borderBottom: armed ? '1px dashed' : 'none',
            borderColor: 'divider',
            mb: armed ? 1 : 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <RefreshIcon
              sx={{
                fontSize: 18,
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 120ms ease',
                animation: refreshing ? 'ptr-spin 900ms linear infinite' : 'none',
                '@keyframes ptr-spin': { to: { transform: 'rotate(360deg)' } },
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontStyle: 'italic',
                letterSpacing: '0.03em',
                fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
                fontSize: '0.78rem',
              }}
            >
              {refreshing ? 'Refreshing…' : armed ? 'Release to refresh' : 'Pull to refresh'}
            </Typography>
          </Box>
        </Box>
      )}
      {children}
    </Box>
  )
}
