/**
 * BottomSheet — mobile-native slide-up panel that replaces fullScreen dialogs.
 *
 * On mobile (xs), renders as a sheet sliding up from the bottom covering ~90vh
 * with a drag handle at the top to dismiss. Drag down past threshold to close.
 * On desktop (sm+), renders as a normal centered MUI Dialog.
 *
 * Uses motion for the slide + drag animation.
 */

import { useRef } from 'react'
import { Box, Dialog, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { motion, AnimatePresence, type PanInfo } from 'motion/react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Max width for the desktop dialog. Default 'sm'. */
  maxWidth?: 'xs' | 'sm' | 'md'
}

const DISMISS_THRESHOLD = 120

export default function BottomSheet({ open, onClose, children, maxWidth = 'sm' }: BottomSheetProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const sheetRef = useRef<HTMLDivElement>(null)

  if (!isMobile) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
        {children}
      </Dialog>
    )
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_THRESHOLD || info.velocity.y > 500) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 1300,
            }}
          />
          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '92vh',
              backgroundColor: 'var(--mui-palette-background-paper, #fff)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              zIndex: 1301,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              touchAction: 'none',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            }}
          >
            {/* Drag handle */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                py: 1,
                cursor: 'grab',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'grey.400',
                }}
              />
            </Box>
            {/* Content — scrollable */}
            <Box sx={{ flex: 1, overflow: 'auto', pb: 'env(safe-area-inset-bottom)' }}>
              {children}
            </Box>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
