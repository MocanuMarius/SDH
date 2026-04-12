/**
 * Autocomplete for ticker symbol: search by company name or symbol (Yahoo Finance).
 * Use in Ticker field; on select, value becomes the chosen symbol (e.g. AAPL).
 */

import { useState, useCallback, useEffect } from 'react'
import { Autocomplete, TextField, CircularProgress, Box, Typography, InputAdornment } from '@mui/material'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import { searchTickers, type TickerSearchResult } from '../services/tickerSearchService'

const DEBOUNCE_MS = 280

export interface TickerAutocompleteProps {
  value: string
  onChange: (ticker: string) => void
  label?: string
  placeholder?: string
  size?: 'small' | 'medium'
  fullWidth?: boolean
  disabled?: boolean
  /** Optional: when used inside a form that also has company_name, set it on select */
  onSelectResult?: (result: TickerSearchResult) => void
}

function getOptionLabel(opt: TickerSearchResult | string): string {
  if (typeof opt === 'string') return opt
  const parts = [opt.symbol]
  if (opt.name) parts.push(` - ${opt.name}`)
  if (opt.exchange) parts.push(` (${opt.exchange})`)
  return parts.join('')
}

export default function TickerAutocomplete({
  value,
  onChange,
  label = 'Ticker',
  placeholder = '$SYMBOL or type to search',
  size = 'small',
  fullWidth = true,
  disabled = false,
  onSelectResult,
}: TickerAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const [options, setOptions] = useState<TickerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [debounceId, setDebounceId] = useState<ReturnType<typeof setTimeout> | null>(null)

  const fetchOptions = useCallback((q: string) => {
    if (!q.trim()) {
      setOptions([])
      return
    }
    setLoading(true)
    searchTickers(q)
      .then((results) => setOptions(results))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [])

  const handleInputChange = (_: unknown, newInputValue: string, reason: string) => {
    setInputValue(newInputValue)
    // Sync freeform text to parent on every keystroke so the ticker is never empty on submit
    if (reason === 'input') {
      onChange(newInputValue.trim().toUpperCase())
    }
    if (debounceId) clearTimeout(debounceId)
    const id = setTimeout(() => fetchOptions(newInputValue), DEBOUNCE_MS)
    setDebounceId(id)
  }

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleChange = (_: unknown, newValue: TickerSearchResult | string | null) => {
    if (newValue == null) {
      onChange('')
      setInputValue('')
      return
    }
    if (typeof newValue === 'string') {
      onChange(newValue.trim().toUpperCase())
      setInputValue(newValue.trim().toUpperCase())
      return
    }
    onChange(newValue.symbol)
    setInputValue(newValue.symbol)
    onSelectResult?.(newValue)
  }

  return (
    <Autocomplete
      freeSolo
      value={value || null}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={handleChange}
      options={options}
      getOptionLabel={getOptionLabel}
      loading={loading}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <InputAdornment position="start" sx={{ mr: 0, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                  <ShowChartIcon color="action" />
                </InputAdornment>
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => {
        const o = option as TickerSearchResult
        return (
          <li {...props} key={o.symbol + (o.exchange || '')}>
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {o.symbol}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {o.name}
                {o.exchange ? ` · ${o.exchange}` : ''}
              </Typography>
            </Box>
          </li>
        )
      }}
    />
  )
}
