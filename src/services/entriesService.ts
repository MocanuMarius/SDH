import { supabase } from './supabaseClient'
import type { Entry, EntryInsert, EntryUpdate } from '../types/database'

const TABLE = 'entries'

/** Outcome projection used by the journal list to render process/outcome badges. */
export interface EntryOutcomeSummary {
  process_score?: number | null
  outcome_score?: number | null
}

/** Action summary attached when fetching entries with actions */
export interface EntryActionSummary {
  ticker: string
  type: string
  /** Embedded outcomes (typically 0 or 1 per action). */
  outcomes?: EntryOutcomeSummary[]
}

/** Entry extended with a minimal actions list for list-view icons */
export type EntryWithActions = Entry & {
  actions?: EntryActionSummary[]
}

export async function listEntries(opts?: {
  from?: string
  to?: string
  tags?: string[]
  search?: string
  limit?: number
  offset?: number
}): Promise<Entry[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })

  if (opts?.from) q = q.gte('date', opts.from)
  if (opts?.to) q = q.lte('date', opts.to)
  if (opts?.tags?.length) q = q.contains('tags', opts.tags)
  if (opts?.limit != null) q = q.limit(opts.limit)
  if (opts?.offset != null) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1)

  if (opts?.search?.trim()) {
    const term = opts.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
    q = q.or(`title_markdown.ilike.%${term}%,body_markdown.ilike.%${term}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Entry[]
}

export async function listEntriesWithActions(opts?: {
  from?: string
  to?: string
  tags?: string[]
  search?: string
  limit?: number
  offset?: number
  hideAutomated?: boolean
}): Promise<EntryWithActions[]> {
  // The embedded outcomes relationship lets us render process/outcome badges
  // on the Journal list without a second query. When an action has no outcome
  // yet the embedded array will be empty and the badge is hidden.
  let q = supabase
    .from(TABLE)
    .select('*, actions(ticker, type, outcomes(process_score, outcome_score))')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })

  // Filter out automated/broker-imported entries at the server level
  if (opts?.hideAutomated) {
    q = q
      .not('tags', 'cs', '{"Automated"}')
      .not('tags', 'cs', '{"IBKR"}')
      .neq('author', 'IBKR')
  }

  if (opts?.from) q = q.gte('date', opts.from)
  if (opts?.to) q = q.lte('date', opts.to)
  if (opts?.tags?.length) q = q.contains('tags', opts.tags)
  if (opts?.limit != null) q = q.limit(opts.limit)
  if (opts?.offset != null) q = q.range(opts.offset, opts.offset + (opts.limit ?? 24) - 1)

  if (opts?.search?.trim()) {
    const term = opts.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
    q = q.or(`title_markdown.ilike.%${term}%,body_markdown.ilike.%${term}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as EntryWithActions[]
}

/**
 * Count how many entries the `hideAutomated` filter would hide. Used on the Journal
 * page to surface "N automated entries hidden" so the user knows the data is there.
 */
export async function countAutomatedEntries(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .or('tags.cs.{"Automated"},tags.cs.{"IBKR"},author.eq.IBKR')
  if (error) {
    console.warn('countAutomatedEntries failed:', error.message)
    return 0
  }
  return count ?? 0
}

export async function getEntry(id: string): Promise<Entry | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Entry
}

export async function getEntryByEntryId(entryId: string): Promise<Entry | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('entry_id', entryId).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Entry
}

export async function createEntry(
  userId: string,
  row: Omit<EntryInsert, 'user_id'>
): Promise<Entry> {
  const insert: EntryInsert = { ...row, user_id: userId }
  const { data, error } = await supabase.from(TABLE).insert(insert).select().single()
  if (error) throw error
  return data as Entry
}

export async function updateEntry(id: string, patch: EntryUpdate): Promise<Entry> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Entry
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
