/**
 * Date → coarse "how long ago was this" bucket, used as the scannable
 * primary label on the Timeline page's "Decisions in range" list and on
 * the per-ticker Decisions table.
 *
 * Rationale for the coarse tail ("Over a month ago" / "Over a year ago"):
 * users care "was this recent vs long-dormant" before the exact day, so
 * this label leads. Without the coarse tail, long chronological scrolls
 * fill with visual noise ("3 months ago, 5 months ago, 7 months ago") —
 * the exact month is already rendered on a secondary line as the precise
 * date, so the bucket's job is scan-ability, not precision.
 */
export function relativeBucket(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return dateStr
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 0) {
    // Future-dated action (rare — someone logging a forward-dated decision)
    if (diffDays === -1) return 'Tomorrow'
    if (diffDays > -14) return `In ${-diffDays} days`
    return 'In the future'
  }
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return 'Over a month ago'
  return 'Over a year ago'
}

/**
 * Exact-date secondary label used next to `relativeBucket`. E.g.
 * "Mon, Apr 14 '26" — intentionally compact so it fits on the same line
 * as the primary bucket without wrapping on narrow viewports.
 */
export function formatDayHeader(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' })
}
