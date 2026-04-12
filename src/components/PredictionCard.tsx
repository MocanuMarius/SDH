import { Box, Button, Chip, IconButton, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import { stripMarkdown } from '../utils/text'
import type { EntryPrediction } from '../types/database'

interface PredictionCardProps {
  prediction: EntryPrediction
  onEdit: () => void
  onDelete: () => void
}

/** Journalytic-style Prediction block: probability, end date, type, optional label and ticker */
export default function PredictionCard({ prediction, onEdit, onDelete }: PredictionCardProps) {
  const tickerLabel = prediction.ticker ? `$${prediction.ticker}` : null
  const typeLabel = prediction.type.charAt(0).toUpperCase() + prediction.type.slice(1)

  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: 'info.main',
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
          <Typography variant="subtitle2" color="info.main" fontWeight={600} sx={{ mb: 0.5 }}>
            Prediction {prediction.probability}%
          </Typography>
          {prediction.label && (
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {stripMarkdown(prediction.label)}
            </Typography>
          )}
          <Box component="dl" sx={{ m: 0, '& dd': { m: 0 }, '& dt': { display: 'inline', fontWeight: 600 } }}>
            <Typography component="div" variant="body2">
              <Box component="span" sx={{ fontWeight: 600 }}>End date:</Box> {prediction.end_date}
            </Typography>
            <Typography component="div" variant="body2">
              <Box component="span" sx={{ fontWeight: 600 }}>Type:</Box> {typeLabel}
            </Typography>
            {tickerLabel && (
              <Box sx={{ mt: 0.5 }}>
                <Chip size="small" label={tickerLabel} sx={{ fontWeight: 600 }} />
              </Box>
            )}
          </Box>
        </Box>
        <Box display="flex" gap={0.5}>
          <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </Button>
          <IconButton size="small" onClick={onDelete} aria-label="Delete prediction" color="error">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
