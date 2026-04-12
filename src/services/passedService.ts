import { supabase } from './supabaseClient'
import { sameCompany } from '../utils/tickerCompany'
import type { Passed, PassReviewStatus } from '../types/database'

const TABLE = 'passed'
const DEFAULT_FOLLOW_UP_DAYS = 90

export async function listPassed(): Promise<Passed[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('passed_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Passed[]
}

export async function createPassed(
  userId: string,
  row: { ticker: string; passed_date?: string; reason?: string; notes?: string }
): Promise<Passed> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      ticker: row.ticker,
      passed_date: row.passed_date ?? new Date().toISOString().slice(0, 10),
      reason: row.reason ?? '',
      notes: row.notes ?? '',
    })
    .select()
    .single()
  if (error) throw error
  return data as Passed
}

export type PassedUpdate = Partial<Pick<Passed, 'passed_date' | 'reason' | 'notes'>>

export async function updatePassed(id: string, patch: PassedUpdate): Promise<Passed> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Passed
}

/**
 * Ensure a passed row exists for this user+ticker (for learning/opportunity cost).
 * If a row for the same company already exists, update it; otherwise create.
 * Call after saving an action with type='pass' so Insights and Passed page stay in sync.
 */
export async function ensurePassedForUser(
  userId: string,
  ticker: string,
  row: { passed_date: string; reason?: string; notes?: string }
): Promise<Passed> {
  const list = await listPassed()
  const existing = list.find((p) => sameCompany(p.ticker, ticker))
  if (existing) {
    return updatePassed(existing.id, {
      passed_date: row.passed_date,
      reason: row.reason ?? existing.reason,
      notes: row.notes ?? existing.notes,
    })
  }
  return createPassed(userId, {
    ticker: ticker.trim(),
    passed_date: row.passed_date,
    reason: row.reason ?? '',
    notes: row.notes ?? '',
  })
}

export async function deletePassed(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

// ─── Passed-idea forced review loop ────────────────────────────────

/**
 * Fetch passed ideas whose follow_up_date is on or before today AND have not
 * yet been reviewed. The Activity drawer renders one "Score your rejection"
 * card per row returned.
 */
export async function listPassedDueForReview(): Promise<Passed[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .is('review_status', null)
    .lte('follow_up_date', today)
    .order('follow_up_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Passed[]
}

/**
 * Record the user's retrospective verdict on a passed idea.
 * `status = 'correct'` means the pass turned out to be right (ticker flat or down),
 * `'should_have_bought'` means they missed a winner,
 * `'inconclusive'` means neither outcome can be judged cleanly.
 */
export async function recordPassReview(
  id: string,
  status: PassReviewStatus,
  notes?: string,
): Promise<Passed> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      review_status: status,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Passed
}

/**
 * Push the follow-up date further into the future. Used when the user isn't
 * ready to judge yet (e.g. thesis hasn't had time to play out).
 */
export async function snoozePassReview(id: string, days = 30): Promise<Passed> {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const nextIso = d.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from(TABLE)
    .update({ follow_up_date: nextIso })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Passed
}

export interface RejectionAccuracy {
  total: number
  correct: number
  missed: number
  inconclusive: number
  /** correct / (correct + missed), null if denominator is 0 */
  accuracy: number | null
}

/**
 * Aggregate Rejection Accuracy across all reviewed passes.
 * accuracy = correct / (correct + missed) — excludes inconclusive from the denominator.
 */
export async function computeRejectionAccuracy(): Promise<RejectionAccuracy> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('review_status')
    .not('review_status', 'is', null)
  if (error) throw error
  const rows = data ?? []
  let correct = 0
  let missed = 0
  let inconclusive = 0
  for (const r of rows) {
    if (r.review_status === 'correct') correct += 1
    else if (r.review_status === 'should_have_bought') missed += 1
    else if (r.review_status === 'inconclusive') inconclusive += 1
  }
  const denom = correct + missed
  return {
    total: correct + missed + inconclusive,
    correct,
    missed,
    inconclusive,
    accuracy: denom > 0 ? correct / denom : null,
  }
}

/** Helper so callers don't need to import the constant. */
export function defaultFollowUpDate(passedDate: string): string {
  const d = new Date(passedDate)
  d.setDate(d.getDate() + DEFAULT_FOLLOW_UP_DAYS)
  return d.toISOString().slice(0, 10)
}
