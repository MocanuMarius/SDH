/**
 * Decision reason field: autocomplete with presets + past reasons,
 * optional "Manage presets".
 *
 * The noise filter below originally hid broker-import-generated reason
 * strings (UUIDs, IBKR codes, etc.) so they didn't pollute the
 * autocomplete. Broker imports are retired now, but the filter stays —
 * historical IBKR rows are still in the DB and would otherwise spam
 * the suggestions list with garbage.
 */

import { useState, useEffect, useMemo } from 'react'
import { Autocomplete, TextField, Box, Link, InputAdornment } from '@mui/material'
import LabelIcon from '@mui/icons-material/Label'
import { getReasonPresets, addReasonPreset } from '../utils/reasonPresets'
import { listActions } from '../services/actionsService'
import { stripMarkdown } from '../utils/text'
import ManageReasonPresetsDialog from './ManageReasonPresetsDialog'

// Patterns that indicate an automated/broker-generated reason — filter these out
const NOISE_PATTERNS = [
  /ibkr/i,
  /_auto_/i,
  /broker.?import/i,
  /automated/i,
  /^[0-9a-f-]{36}$/i, // UUID
  /^[A-Z0-9]{6,20}$/, // all-caps codes like "IBKR_BUY_AAPL"
]

function isNoiseReason(reason: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(reason))
}

export interface ReasonFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  size?: 'small' | 'medium'
  fullWidth?: boolean
  /** Show "Manage presets" link */
  showManagePresets?: boolean
}

const SAVE_PRESET_KEY = '__save_as_preset__'

export default function ReasonField({
  value,
  onChange,
  label = 'Reason',
  placeholder = 'e.g. Cheap, Too expensive, Price drop',
  size = 'small',
  fullWidth,
  showManagePresets = true,
}: ReasonFieldProps) {
  const [recentReasons, setRecentReasons] = useState<string[]>([])
  const [presetsVersion, setPresetsVersion] = useState(0)
  const [manageOpen, setManageOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    listActions({ limit: 300 })
      .then((actions) => {
        if (cancelled) return
        const reasons = new Set<string>()
        actions.forEach((a) => {
          const r = stripMarkdown((a.reason || '').trim())
          if (r && r.length < 120 && !isNoiseReason(r)) reasons.add(r)
        })
        setRecentReasons(Array.from(reasons))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // `presetsVersion` is intentionally a dep even though it's not used in the
  // body — `getReasonPresets()` reads from localStorage which is outside
  // React's reactive scope. Bumping the version forces re-evaluation when a
  // preset is added/removed elsewhere.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const presets = useMemo(() => getReasonPresets().map((p) => p.label), [presetsVersion])

  const options = useMemo(() => {
    const combined = new Set<string>([...presets, ...recentReasons])
    const sorted = Array.from(combined)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    // If user typed something that isn't already a preset, offer to save it
    const trimmed = value.trim()
    if (trimmed && !presets.includes(trimmed)) {
      return [...sorted, SAVE_PRESET_KEY]
    }
    return sorted
    // presetsVersion intentional, see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentReasons, presetsVersion, value, presets])

  const handleChange = (_: unknown, v: string | null) => {
    if (v === SAVE_PRESET_KEY) {
      const trimmed = value.trim()
      if (trimmed) {
        addReasonPreset(trimmed)
        setPresetsVersion((n) => n + 1)
      }
      return
    }
    onChange(typeof v === 'string' ? v : v ?? '')
  }

  return (
    <Box sx={{ width: fullWidth ? '100%' : undefined }}>
      <Autocomplete
        freeSolo
        size={size}
        fullWidth={fullWidth}
        options={options}
        value={value}
        inputValue={value}
        onInputChange={(_, v) => onChange(v)}
        onChange={handleChange}
        getOptionLabel={(opt) => opt === SAVE_PRESET_KEY ? '' : opt}
        renderOption={(props, opt) =>
          opt === SAVE_PRESET_KEY ? (
            <li {...props} key={SAVE_PRESET_KEY} style={{ fontStyle: 'italic', color: '#0369a1' }}>
              + Save "{value.trim()}" as preset
            </li>
          ) : (
            <li {...props} key={opt}>{opt}</li>
          )
        }
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
                    <LabelIcon color="action" />
                  </InputAdornment>
                  {params.InputProps.startAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {showManagePresets && (
        <Link
          component="button"
          type="button"
          variant="caption"
          onClick={() => setManageOpen(true)}
          sx={{ mt: 0.5, display: 'block' }}
        >
          Manage reason presets
        </Link>
      )}
      <ManageReasonPresetsDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onPresetsChange={() => setPresetsVersion((v) => v + 1)}
      />
    </Box>
  )
}
