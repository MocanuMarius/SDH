/**
 * ListCard — a reusable "list of items with inline add" primitive.
 *
 * Visual language matches the entry form's RowCard, but always-expanded: a
 * header (title + count badge + description), then children that render the
 * rows and an inline add affordance. Pair with `ItemRow` for individual rows.
 *
 * Used on the entry form (Decisions, Predictions, Entry/Exit Rules) and on
 * the entry detail page (Reminders). One pattern → users learn it once.
 */

import { Paper, Box, Typography, IconButton } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

export interface ListCardProps {
  title: string
  description?: string
  count?: number
  /** When true, card gets the active border/bg treatment. Defaults to count > 0. */
  hasValue?: boolean
  /** Optional trailing header slot — e.g. a "+" IconButton for modal-driven adds. */
  headerAction?: React.ReactNode
  children: React.ReactNode
}

export default function ListCard({
  title,
  description,
  count = 0,
  hasValue,
  headerAction,
  children,
}: ListCardProps) {
  const active = hasValue ?? count > 0
  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        transition: 'background-color 120ms, border-color 120ms',
        bgcolor: active ? 'background.paper' : 'grey.50',
        borderColor: active ? 'primary.light' : 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="baseline" gap={0.75}>
            <Typography variant="body2" fontWeight={700} color="text.primary">{title}</Typography>
            {count > 0 && (
              <Typography variant="caption" color="text.secondary" fontWeight={600}>({count})</Typography>
            )}
          </Box>
          {!active && description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.72rem', mt: 0.25 }}>
              {description}
            </Typography>
          )}
        </Box>
        {headerAction}
      </Box>
      <Box sx={{ px: 1.5, pb: 1.5, pt: 0.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {children}
      </Box>
    </Paper>
  )
}

export interface ItemRowProps {
  children: React.ReactNode
  onDelete?: () => void
  ariaLabel?: string
  /** Override the default trash icon. */
  deleteIcon?: React.ReactNode
}

/**
 * A single row inside a ListCard: content flexed left, a trash icon on the right.
 * Matches the Decisions / Predictions / Rules row aesthetic.
 */
export function ItemRow({ children, onDelete, ariaLabel = 'Remove item', deleteIcon }: ItemRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.75,
        bgcolor: 'grey.50',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        {children}
      </Box>
      {onDelete && (
        <IconButton size="small" onClick={onDelete} aria-label={ariaLabel}>
          {deleteIcon ?? <DeleteOutlineIcon fontSize="small" />}
        </IconButton>
      )}
    </Box>
  )
}
