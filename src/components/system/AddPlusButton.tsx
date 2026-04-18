/**
 * AddPlusButton — the small primary-coloured "+" IconButton that lives in a
 * ListCard header action. Three pages had defined it inline with identical sx
 * (entry form Decisions, entry detail Reminders, settings preset cards) — now
 * one source of truth.
 */
import { IconButton } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'

export interface AddPlusButtonProps {
  /** Accessible label / tooltip — "Add decision", "Add reminder", etc. */
  label: string
  onClick: () => void
}

export default function AddPlusButton({ label, onClick }: AddPlusButtonProps) {
  return (
    <IconButton
      size="small"
      onClick={onClick}
      aria-label={label}
      sx={{
        color: 'primary.contrastText',
        bgcolor: 'primary.main',
        '&:hover': { bgcolor: 'primary.dark' },
        width: 28,
        height: 28,
      }}
    >
      <AddIcon fontSize="small" />
    </IconButton>
  )
}
