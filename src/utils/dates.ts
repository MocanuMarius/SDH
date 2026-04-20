/**
 * Date helpers that respect LOCAL time.
 *
 * Why: `new Date().toISOString().slice(0, 10)` returns the UTC date,
 * not the user's local date. At 11pm in UTC-5 that's already
 * "tomorrow" in UTC — so a user adding a decision late at night
 * would see it stamped with tomorrow's date. Postgres `date` columns
 * don't carry a timezone, so writing a UTC-derived date silently
 * drifts the record by one day.
 *
 * Use `todayISO()` anywhere we currently wrote `new Date().toISOString().slice(0, 10)`.
 * Use `daysAgoISO(n)` anywhere we subtract days for a preset.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** ISO-8601 date (YYYY-MM-DD) in the user's local timezone. */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO-8601 date (YYYY-MM-DD) for `n` days before today, local timezone. */
export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO-8601 date (YYYY-MM-DD) for `n` days after today, local timezone. */
export function daysFromTodayISO(n: number): string {
  return daysAgoISO(-n)
}
