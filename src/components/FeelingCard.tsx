import { Box, Button, Chip, IconButton, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import { stripMarkdown } from '../utils/text'
import type { EntryFeeling } from '../types/database'

interface FeelingCardProps {
  feeling: EntryFeeling
  onEdit: () => void
  onDelete: () => void
}

/** Journalytic-style Feeling block: score 1–10, label, type (idea | market), optional ticker */
export default function FeelingCard({ feeling, onEdit, onDelete }: FeelingCardProps) {
  const tickerLabel = feeling.ticker ? `$${feeling.ticker}` : null
  const typeLabel = feeling.type.charAt(0).toUpperCase() + feeling.type.slice(1)

  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: 'secondary.main',
        pl: 2,
        py: 1.5,
        pr: 1,
        my: 1.5,
        bgcolor: 'grey.100',
        borderRadius: 1,
      }}
    >
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box flex={1} minWidth={0}>
          <Typography variant="subtitle2" color="secondary.main" fontWeight={600} sx={{ mb: 0.5 }}>
            Feeling {feeling.score}/10
          </Typography>
          {feeling.label && (
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {stripMarkdown(feeling.label)}
            </Typography>
          )}
          <Typography component="div" variant="body2">
            <Box component="span" sx={{ fontWeight: 600 }}>Type:</Box> {typeLabel}
            {tickerLabel && (
              <>
                {' '}
                <Chip size="small" label={tickerLabel} sx={{ fontWeight: 600, ml: 0.5 }} component="span" />
              </>
            )}
          </Typography>
        </Box>
        <Box display="flex" gap={0.5}>
          <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </Button>
          <IconButton size="small" onClick={onDelete} aria-label="Delete feeling" color="error">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
