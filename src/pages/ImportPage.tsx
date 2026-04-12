import { useState } from 'react'
import { Box, Typography, Button, Alert, LinearProgress } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth } from '../contexts/AuthContext'
import { createEntry } from '../services/entriesService'
import { parseCsv, csvRowToEntry } from '../utils/csvImport'

export default function ImportPage() {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setResult(null)
  }

  const handleImport = async () => {
    if (!user || !file) return
    setImporting(true)
    setResult(null)
    const text = await file.text()
    const rows = parseCsv(text)
    let created = 0
    const errors: string[] = []
    for (let i = 0; i < rows.length; i++) {
      try {
        const row = csvRowToEntry(rows[i])
        await createEntry(user.id, row)
        created++
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setResult({ created, failed: rows.length - created, errors: errors.slice(0, 10) })
    setImporting(false)
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>
        Import entries
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        Upload a Journalytic-compatible CSV with columns: EntryId, Date, Author, Tags, TitleMarkdown, BodyMarkdown.
      </Typography>

      <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={importing}>
          Choose CSV
          <input type="file" accept=".csv" hidden onChange={handleFileChange} />
        </Button>
        {file && (
          <>
            <Typography variant="body2">{file.name}</Typography>
            <Button variant="contained" onClick={handleImport} disabled={importing}>
              Import
            </Button>
          </>
        )}
      </Box>

      {importing && <LinearProgress sx={{ mb: 2 }} />}

      {result && (
        <Alert severity={result.failed === 0 ? 'success' : 'warning'} sx={{ mt: 2 }}>
          Created {result.created} entries. {result.failed > 0 && `Failed: ${result.failed}.`}
          {result.errors.length > 0 && (
            <Box component="ul" sx={{ mt: 1, pl: 2 }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {result.errors.length < result.failed && <li>… and more</li>}
            </Box>
          )}
        </Alert>
      )}
    </Box>
  )
}
