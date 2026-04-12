/**
 * TextField wrapper that shows a ticker dropdown when user types $ and then a query.
 * Search is by company name or symbol (Yahoo Finance). On select, inserts $SYMBOL.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { TextField, Popper, Paper, List, ListItemButton, Typography, CircularProgress, Box } from '@mui/material'
import { searchTickers, type TickerSearchResult } from '../services/tickerSearchService'
import type { TextFieldProps } from '@mui/material/TextField'

const DEBOUNCE_MS = 300
const MIN_QUERY_LEN = 1

/** Returns [dollarIndex, query] if cursor is after $ and we have a word to complete; else null */
function getDollarQuery(value: string, cursorStart: number): [number, string] | null {
  if (!value || cursorStart <= 0) return null
  const before = value.slice(0, cursorStart)
  const lastDollar = before.lastIndexOf('$')
  if (lastDollar === -1) return null
  const afterDollar = before.slice(lastDollar + 1)
  const match = afterDollar.match(/^[A-Za-z0-9.]*$/)
  if (!match) return null
  const query = match[0]
  if (query.length < MIN_QUERY_LEN) return null
  return [lastDollar, query]
}

export interface TickerDollarFieldProps extends Omit<TextFieldProps, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
}

export default function TickerDollarField({ value, onChange, ...textFieldProps }: TickerDollarFieldProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TickerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [cursorStart, setCursorStart] = useState(0)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const nextSelectionRef = useRef<number | null>(null)

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    searchTickers(q)
      .then((r) => setResults(r))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setAnchorEl(null)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  // Restore cursor after we replace text
  useEffect(() => {
    if (nextSelectionRef.current != null && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.setSelectionRange(nextSelectionRef.current, nextSelectionRef.current)
      nextSelectionRef.current = null
    }
  }, [value])

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [results])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const start = e.target.selectionStart ?? 0
    onChange(newValue)
    setCursorStart(start)
    const parsed = getDollarQuery(newValue, start)
    if (parsed) {
      const [, q] = parsed
      setQuery(q)
      setAnchorEl(e.target)
    } else {
      setQuery('')
      setAnchorEl(null)
    }
  }

  const handleSelect = useCallback((opt: TickerSearchResult) => {
    const [dollarIdx] = getDollarQuery(value, cursorStart) ?? [0, '']
    const newValue = value.slice(0, dollarIdx + 1) + opt.symbol + ' ' + value.slice(cursorStart)
    nextSelectionRef.current = dollarIdx + 1 + opt.symbol.length + 1
    onChange(newValue)
    setAnchorEl(null)
    setQuery('')
    setResults([])
  }, [value, cursorStart, onChange])

  const open = Boolean(anchorEl) && (results.length > 0 || loading)

  // Keyboard navigation for the dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || results.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelect(results[highlightedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setAnchorEl(null)
        setQuery('')
        setResults([])
      }
    }

    const inputElement = inputRef.current
    if (inputElement) {
      inputElement.addEventListener('keydown', handleKeyDown as EventListener)
      return () => {
        inputElement.removeEventListener('keydown', handleKeyDown as EventListener)
      }
    }
  }, [open, results, highlightedIndex, handleSelect])

  return (
    <>
      <TextField
        {...textFieldProps}
        value={value}
        onChange={handleChange}
        inputRef={(el) => {
          inputRef.current = el
          if (textFieldProps.inputRef) {
            if (typeof textFieldProps.inputRef === 'object') (textFieldProps.inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
            else (textFieldProps.inputRef as (inst: HTMLInputElement | null) => void)(el)
          }
        }}
      />
      <Popper open={open} anchorEl={anchorEl} placement="bottom-start" style={{ zIndex: 1400 }} modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}>
        <Paper elevation={8} sx={{ maxHeight: 320, overflow: 'auto', minWidth: 280 }}>
          {loading ? (
            <Box display="flex" alignItems="center" justifyContent="center" py={2}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense disablePadding>
              {results.map((opt, index) => (
                <ListItemButton
                  key={opt.symbol + (opt.exchange || '')}
                  selected={highlightedIndex === index}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseLeave={() => setHighlightedIndex(-1)}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      ${opt.symbol}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {opt.name}
                      {opt.exchange ? ` · ${opt.exchange}` : ''}
                    </Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
      </Popper>
    </>
  )
}
