/**
 * Format dates as relative ("3 months ago") and full ("29 April 2025") for display and tooltips.
 */

/**
 * Format ISO date (YYYY-MM-DD) for tooltip: "29 April 2025"
 */
export function formatDateFull(isoDate: string | null | undefined): string {
  if (isoDate == null || !isoDate.trim()) return ''
  const d = new Date(isoDate.trim() + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Relative time from now: "today", "yesterday", "5 days ago", "2 months ago", "1 year ago"
 */
export function formatDateRelative(isoDate: string | null | undefined): string {
  if (isoDate == null || !isoDate.trim()) return ''
  const d = new Date(isoDate.trim() + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return isoDate
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffMs = today.getTime() - that.getTime()
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  const months = Math.floor(diffDays / 30.44)
  if (months < 24) return `${months} months ago`
  return `${Math.floor(diffDays / 365.25)} years ago`
}
