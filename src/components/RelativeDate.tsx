/**
 * Shows a date as relative text ("3 months ago") with a tooltip for the exact date ("29 April 2025").
 * Styled like a link (underline on hover) so it's clear you can hover for details.
 */

import { Tooltip, Typography } from '@mui/material'
import { formatDateFull, formatDateRelative } from '../utils/relativeDate'

export interface RelativeDateProps {
  /** ISO date string (YYYY-MM-DD) */
  date: string | null | undefined
  /** Optional variant/sx for the text */
  variant?: React.ComponentProps<typeof Typography>['variant']
  component?: React.ElementType
  sx?: React.ComponentProps<typeof Typography>['sx']
}

export default function RelativeDate({
  date,
  variant = 'body2',
  component = 'span',
  sx,
}: RelativeDateProps) {
  const relative = formatDateRelative(date)
  const full = formatDateFull(date)
  if (!relative && !full) return null

  const label = relative || full
  const tooltipTitle = full

  return (
    <Tooltip title={tooltipTitle} enterDelay={300} leaveDelay={0}>
      <Typography
        component={component}
        variant={variant}
        sx={{
          cursor: 'default',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: 2,
          '&:hover': { textDecorationStyle: 'solid' },
          ...sx,
        }}
      >
        {label}
      </Typography>
    </Tooltip>
  )
}
