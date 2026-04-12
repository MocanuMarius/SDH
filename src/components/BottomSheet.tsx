/**
 * BottomSheet — mobile-friendly dialog.
 *
 * On mobile (xs): fullScreen MUI Dialog with slide-up transition.
 * On desktop (sm+): normal centered MUI Dialog.
 *
 * Uses standard MUI Dialog on both to avoid z-index issues with
 * nested Select/Autocomplete/Menu components.
 */

import { forwardRef } from 'react'
import { Dialog, Slide, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { TransitionProps } from '@mui/material/transitions'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Max width for the desktop dialog. Default 'sm'. */
  maxWidth?: 'xs' | 'sm' | 'md'
}

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />
})

export default function BottomSheet({ open, onClose, children, maxWidth = 'sm' }: BottomSheetProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      fullScreen={isMobile}
      TransitionComponent={isMobile ? SlideUp : undefined}
      PaperProps={isMobile ? {
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          mt: 'env(safe-area-inset-top, 8px)',
          maxHeight: '95vh',
        },
      } : undefined}
    >
      {children}
    </Dialog>
  )
}
