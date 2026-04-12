/**
 * PullToRefresh — wrap scrollable content to add a pull-down-to-refresh gesture.
 *
 * When the user pulls down from the top of the scroll container, a small spinner
 * appears and the onRefresh callback fires. The spinner disappears after the
 * callback resolves.
 *
 * Only activates when scrollTop === 0 (at the very top).
 */

import { useRef, useState, useCallback } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'

interface PullToRefreshProps {
  children: React.ReactNode
  onRefresh: () => Promise<void>
}

const PULL_THRESHOLD = 60
const MAX_PULL = 100

export default function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const isPulling = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 5) return
    startY.current = e.touches[0].clientY
    isPulling.current = true
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) { isPulling.current = false; setPulling(false); setPullDistance(0); return }
    const clamped = Math.min(MAX_PULL, dy * 0.5)
    setPulling(true)
    setPullDistance(clamped)
  }, [refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return
    isPulling.current = false
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD)
      try { await onRefresh() } finally {
        setRefreshing(false)
        setPulling(false)
        setPullDistance(0)
      }
    } else {
      setPulling(false)
      setPullDistance(0)
    }
  }, [pullDistance, refreshing, onRefresh])

  const progress = Math.min(100, (pullDistance / PULL_THRESHOLD) * 100)

  return (
    <Box
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      sx={{ position: 'relative' }}
    >
      {/* Pull indicator */}
      {(pulling || refreshing) && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1,
            height: pullDistance,
            transition: refreshing ? 'none' : 'height 0.1s',
            overflow: 'hidden',
          }}
        >
          {refreshing ? (
            <CircularProgress size={20} />
          ) : (
            <>
              <CircularProgress size={18} variant="determinate" value={progress} />
              {progress >= 100 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  Release to refresh
                </Typography>
              )}
            </>
          )}
        </Box>
      )}
      {children}
    </Box>
  )
}
