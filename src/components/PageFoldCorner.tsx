/**
 * PageFoldCorner — an absolutely-positioned top-right folded-corner
 * ornament. Pure CSS (two triangles), no images.
 *
 * Visual metaphor: the corner of a newspaper page turned up slightly,
 * showing the underside. Used as a quiet editorial flourish on
 * "opened article" surfaces (entry detail body, per-ticker detail).
 *
 * Sizes: `sm` = 20px fold, `md` = 28px, `lg` = 36px.
 * Respects reduced-motion (no transition on hover).
 */

import { Box } from '@mui/material'

export interface PageFoldCornerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Fold background color — the "underside" tint. Defaults to the
   *  muted grey-50 so it reads as a turned page, not a contrast. */
  underside?: string
  /** Shadow color under the fold — keeps the fold grounded. */
  shadow?: string
  /** Absolute-position overlay placement. Parent must have a
   *  `position: relative` (or similar) for this to latch on. */
  corner?: 'top-right' | 'top-left'
}

const SIZES = { sm: 20, md: 28, lg: 36 }

export default function PageFoldCorner({
  size = 'md',
  underside,
  shadow,
  corner = 'top-right',
}: PageFoldCornerProps) {
  const s = SIZES[size]
  const side = corner === 'top-right' ? 'right' : 'left'
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        top: 0,
        [side]: 0,
        width: s,
        height: s,
        pointerEvents: 'none',
        // Two stacked triangles: the first is the visible folded-down
        // "underside" triangle, the second is a thin soft shadow
        // extending to suggest the fold's volume. Border-only trick —
        // no images, no blur filters, very cheap.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          [side]: 0,
          width: 0,
          height: 0,
          // Underside triangle faces the corner: e.g. top-right has
          // a triangle with its hypotenuse along the diagonal.
          borderStyle: 'solid',
          borderWidth: corner === 'top-right'
            ? `${s}px ${s}px 0 0`
            : `${s}px 0 0 ${s}px`,
          borderColor: corner === 'top-right'
            ? `${underside || 'var(--mui-palette-grey-100, #ede9df)'} transparent transparent transparent`
            : `${underside || 'var(--mui-palette-grey-100, #ede9df)'} transparent transparent transparent`,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          [side]: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          // Soft shadow line along the fold's hypotenuse — darker
          // below to suggest the upper fold casting a thin shadow
          // on the page below.
          borderWidth: corner === 'top-right'
            ? `${s + 1}px ${s + 1}px 0 0`
            : `${s + 1}px 0 0 ${s + 1}px`,
          borderColor: `transparent ${shadow || 'rgba(15, 23, 42, 0.08)'} transparent transparent`,
          // Shift 1px so the shadow peeks from under the underside
          // triangle instead of covering it.
          transform: corner === 'top-right' ? 'translate(1px, -1px)' : 'translate(-1px, -1px) scaleX(-1)',
          zIndex: -1,
        },
      }}
    />
  )
}
