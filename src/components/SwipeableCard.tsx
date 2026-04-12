/**
 * SwipeableCard — swipe left to reveal action buttons on the right.
 *
 * Uses Motion (motion.dev) for drag gestures + spring physics.
 * The card face shows content; swiping left slides it to reveal a
 * row of action buttons underneath. Releasing snaps to either:
 *   - open (actions visible) if swiped past threshold
 *   - closed (card back to origin) otherwise
 *
 * Designed for mobile-first UX. On desktop the actions are still
 * accessible via the swipe or a subtle "..." hint on hover.
 *
 * Usage:
 *   <SwipeableCard
 *     actions={[
 *       { icon: <EditIcon />, label: 'Edit', onClick: handleEdit },
 *       { icon: <DeleteIcon />, label: 'Delete', onClick: handleDelete, color: '#dc2626' },
 *     ]}
 *   >
 *     <YourCardContent />
 *   </SwipeableCard>
 */

import { useRef, useState } from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from 'motion/react'
import { Box, Typography } from '@mui/material'

export interface SwipeAction {
  icon: React.ReactNode
  label: string
  onClick: () => void
  /** Background colour for this action button. Default: primary blue. */
  color?: string
}

interface SwipeableCardProps {
  children: React.ReactNode
  /** Action buttons revealed on swipe-left. Rendered right-to-left. */
  actions: SwipeAction[]
  /** Width per action button in px. Default 64. */
  actionWidth?: number
  /** Sx overrides for the outer container. */
  sx?: Record<string, unknown>
}

const VELOCITY_THRESHOLD = 200
const SNAP_SPRING = { stiffness: 500, damping: 40, mass: 0.8 }

export default function SwipeableCard({
  children,
  actions,
  actionWidth = 64,
  sx,
}: SwipeableCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalActionsWidth = actions.length * actionWidth
  const x = useMotionValue(0)

  // Actions row opacity: fade in as the card slides
  const actionsOpacity = useTransform(x, [-totalActionsWidth, -20, 0], [1, 0.5, 0])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x
    const velocity = info.velocity.x

    if (velocity < -VELOCITY_THRESHOLD || offset < -totalActionsWidth / 3) {
      animate(x, -totalActionsWidth, { type: 'spring', ...SNAP_SPRING })
      setIsOpen(true)
    } else {
      animate(x, 0, { type: 'spring', ...SNAP_SPRING })
      setIsOpen(false)
    }
  }

  const close = () => {
    animate(x, 0, { type: 'spring', ...SNAP_SPRING })
    setIsOpen(false)
  }

  const handleActionClick = (action: SwipeAction) => {
    close()
    setTimeout(action.onClick, 80)
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        touchAction: 'pan-y',
        ...sx,
      }}
    >
      {/* Actions row — sits behind the card face, anchored to the right */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: totalActionsWidth,
          display: 'flex',
          alignItems: 'stretch',
          opacity: actionsOpacity,
          zIndex: 0,
        }}
      >
        {actions.map((action, i) => (
          <Box
            key={i}
            onClick={() => handleActionClick(action)}
            sx={{
              width: actionWidth,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              bgcolor: action.color || '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              '&:hover': { opacity: 0.85 },
              '&:active': { opacity: 0.7 },
            }}
          >
            {action.icon}
            <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600, color: '#fff', lineHeight: 1 }}>
              {action.label}
            </Typography>
          </Box>
        ))}
      </motion.div>

      {/* Card face — draggable layer on top */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -totalActionsWidth, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        onTap={() => { if (isOpen) close() }}
        style={{
          x,
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'var(--mui-palette-background-paper, #fff)',
        }}
      >
        {children}
      </motion.div>
    </Box>
  )
}
