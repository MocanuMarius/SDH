/**
 * Parse a CSV string into rows of record objects.
 * Assumes first row is header. Handles quoted fields.
 */
export function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let field = ''
      i++
      while (i < line.length) {
        if (line[i] === '"') {
          i++
          if (line[i] === '"') {
            field += '"'
            i++
          } else break
        } else {
          field += line[i]
          i++
        }
      }
      result.push(field)
      if (line[i] === ',') i++
    } else {
      let field = ''
      while (i < line.length && line[i] !== ',') {
        field += line[i]
        i++
      }
      result.push(field.trim())
      if (line[i] === ',') i++
    }
  }
  return result
}

/**
 * Map CSV row (Journalytic columns) to entry insert shape (without user_id).
 */
export function csvRowToEntry(row: Record<string, string>): {
  entry_id: string
  date: string
  author: string
  tags: string[]
  title_markdown: string
  body_markdown: string
} {
  const entryId = (row['EntryId'] ?? row['entry_id'] ?? '').trim()
  const date = (row['Date'] ?? row['date'] ?? '').trim() || new Date().toISOString().slice(0, 10)
  const author = (row['Author'] ?? row['author'] ?? '').trim()
  const tagsStr = (row['Tags'] ?? row['tags'] ?? '').trim()
  const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : []
  const title_markdown = (row['TitleMarkdown'] ?? row['title_markdown'] ?? '').trim()
  const body_markdown = (row['BodyMarkdown'] ?? row['body_markdown'] ?? '').trim()
  return {
    entry_id: entryId || `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    date,
    author,
    tags,
    title_markdown,
    body_markdown,
  }
}
