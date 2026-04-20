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
}): Promise<EntryWithActions[]> {
  // The embedded outcomes relationship lets us render process/outcome badges
  // on the Journal list without a second query. When an action has no outcome
  // yet the embedded array will be empty and the badge is hidden.
  // The `hideAutomated` server-side filter and the `countAutomatedEntries`
  // helper used to live here; both retired with the broker-import surface
  // (the user keeps decisions manually now and there's no automated source
  // to filter out anymore).
  let q = supabase
    .from(TABLE)
    .select('*, actions(ticker, type, outcomes(process_score, outcome_score))')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })

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
  // The FK `actions.entry_id → entries.id` is declared ON DELETE SET
  // NULL (intentional: the feature permits "standalone decisions"
  // that live outside any entry). That means a plain DELETE on
  // entries leaves this entry's action rows in the DB with entry_id
  // set to null — orphaned rows that still show up in the Tickers
  // list and actions feed, and still carry any outcomes that
  // cascaded from them. The ConfirmDialog copy promises "this will
  // permanently delete this journal entry and all its actions and
  // outcomes" so the user reasonably expects cleanup here. Do it
  // explicitly before dropping the entry: actions → CASCADE → outcomes.
  // entry_predictions, reminders, entry_valuations all cascade via
  // their own FKs so we don't need to touch them.
  const { error: actErr } = await supabase
    .from('actions')
    .delete()
    .eq('entry_id', id)
  if (actErr) throw actErr
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
