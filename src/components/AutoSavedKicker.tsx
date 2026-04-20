/**
 * AutoSavedKicker — italic serif kicker that announces "Draft saved
 * just now" → "Draft saved 30s ago" → … as the form's auto-save fires.
 *
 * Designed to give writers quiet confidence the page won't lose
 * their words. Visible only on a NEW entry (the only flow that
 * auto-saves to localStorage); on an edit flow there's nothing to
 * auto-save until the user clicks Save.
 *
 * Three states:
 *   - No content yet: hide entirely. (Don't whisper "saved" before
 *     the user has typed anything.)
 *   - Content typed but no save yet: italic "Draft will save in a
 *     moment" — sets the expectation.
 *   - Saved: italic "Draft saved just now" / "Draft saved 30s ago".
 *     Re-pulses opacity briefly when lastSavedAt updates so the eye
 *     catches the freshness.
 *
 * Time bucket updates every ~10s via a local interval so the label
 * tracks reality without a heavyweight timer lib.
 */

import { useEffect, useState, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'

export interface AutoSavedKickerProps {
  isNew: boolean
  /** Unix ms of the last successful auto-save. null = never saved this session. */
  lastSavedAt: number | null
  /** Has the user typed anything yet? Hides the kicker entirely if not. */
  hasContent: boolean
  /** Recent auto-save timestamps (newest last). Used to render a
   *  tiny sparkline showing how long the writer has been at this. */
  saveHistory?: number[]
  /** Words added since the page mounted. Shown as a quiet badge so
   *  the writer can see prolific sessions ("420 words this session"). */
  sessionWordsWritten?: number
}

/** Sparkline of save events along the last 60 minutes. Each tick is
 *  an autosave; their horizontal placement maps to time-since-save.
 *  Pure SVG, no lib. */
function SaveSparkline({ saves }: { saves: number[] }) {
  if (!saves || saves.length < 2) return null
  const now = Date.now()
  const span = 60 * 60 * 1000 // 60 min window
  const oldest = Math.min(...saves)
  const start = Math.min(now - span, oldest)
  const points = saves.map((t) => ({
    x: ((t - start) / (now - start)) * 100,
  }))
  return (
    <Box
      aria-hidden
      sx={{ display: 'inline-flex', alignItems: 'center', height: 12, ml: 0.5 }}
    >
      <svg width={48} height={12} viewBox="0 0 100 12" preserveAspectRatio="none">
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={6} r={1.4} fill="currentColor" opacity={0.55} />
        ))}
      </svg>
    </Box>
  )
}

function formatRelative(now: number, then: number): string {
  const diff = Math.max(0, Math.round((now - then) / 1000))
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const m = Math.round(diff / 60)
  if (m === 1) return '1 min ago'
  if (m < 60) return `${m} min ago`
  return 'a while ago'
}

export default function AutoSavedKicker({ isNew, lastSavedAt, hasContent, saveHistory = [], sessionWordsWritten = 0 }: AutoSavedKickerProps) {
  const [tick, setTick] = useState(0)
  const [pulse, setPulse] = useState(false)
  const lastShownRef = useRef<number | null>(null)

  // Re-render every 10s while there's a saved timestamp so the
  // "30s ago" label stays honest.
  useEffect(() => {
    if (!lastSavedAt) return
    const t = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [lastSavedAt])

  // Pulse opacity briefly when a fresh save lands so the eye notices.
  useEffect(() => {
    if (!lastSavedAt) return
    if (lastShownRef.current === lastSavedAt) return
    lastShownRef.current = lastSavedAt
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [lastSavedAt])

  if (!isNew) return <Box />            // edit flow: nothing to whisper
  if (!hasContent) return <Box />       // empty page: hold tongue

  if (!lastSavedAt) {
    return (
      <Typography
        variant="caption"
        sx={{
          fontStyle: 'italic',
          fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
          fontSize: '0.78rem',
          color: 'text.disabled',
        }}
      >
        Draft will save in a moment
      </Typography>
    )
  }

  void tick // re-render trigger
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        color: 'text.secondary',
        opacity: pulse ? 1 : 0.85,
        transition: 'opacity 600ms ease',
      }}
    >
      <CheckCircleOutlineIcon
        sx={{
          fontSize: 14,
          color: 'success.main',
          opacity: 0.85,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontStyle: 'italic',
          fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif",
          fontSize: '0.78rem',
          letterSpacing: '0.01em',
        }}
      >
        Draft saved {formatRelative(Date.now(), lastSavedAt)}
      </Typography>
      <SaveSparkline saves={saveHistory} />
      {sessionWordsWritten > 50 && (
        <Typography
          variant="caption"
          sx={{
            fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.68rem',
            color: 'text.disabled',
            ml: 0.75,
            letterSpacing: '0.04em',
          }}
        >
          · +{sessionWordsWritten} words this session
        </Typography>
      )}
    </Box>
  )
}
