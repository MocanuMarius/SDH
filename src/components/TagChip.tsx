/**
 * Tag chip styled as a #tag pill with optional color from presets.
 */

import { Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { getTagColor } from '../utils/tagPresets'

interface TagChipProps extends Omit<ChipProps, 'label'> {
  tag: string
  /** Override color (used in settings page while editing) */
  colorOverride?: string
}

export default function TagChip({ tag, colorOverride, sx, ...rest }: TagChipProps) {
  const color = colorOverride ?? getTagColor(tag)

  // Strip leading # if already present to avoid ##tag
  const display = (tag ?? '').startsWith('#') ? tag : `#${tag ?? ''}`

  return (
    <Chip
      label={display}
      size="small"
      variant="outlined"
      sx={{
        ...(color
          ? {
              borderColor: color,
              color,
              '& .MuiChip-label': { fontWeight: 500 },
            }
          : {
              '& .MuiChip-label': { fontWeight: 500 },
            }),
        ...sx,
      }}
      {...rest}
    />
  )
}
