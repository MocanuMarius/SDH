import { supabase } from './supabaseClient'
import type { Action, ActionInsert, ActionUpdate } from '../types/database'

const TABLE = 'actions'

export interface ActionWithEntry extends Action {
  entry?: { id: string; title_markdown: string; date: string; tags?: string[]; author?: string | null } | null
}

export async function listActions(opts?: {
  type?: string
  ticker?: string
  limit?: number
  offset?: number
}): Promise<ActionWithEntry[]> {
  let q = supabase
    .from(TABLE)
    .select('*, entry:entries(id, title_markdown, date, tags, author)')
    .order('action_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.type) q = q.eq('type', opts.type)
  if (opts?.ticker) q = q.eq('ticker', opts.ticker)
  if (opts?.limit != null) q = q.limit(opts.limit)
  if (opts?.offset != null) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ActionWithEntry[]
}

export async function listActionsByEntryId(entryId: string): Promise<Action[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('entry_id', entryId)
    .order('action_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Action[]
}

export async function getAction(id: string): Promise<Action | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Action
}

export async function createAction(row: ActionInsert): Promise<Action> {
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw error
  return data as Action
}

export async function updateAction(id: string, patch: ActionUpdate): Promise<Action> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Action
}

export async function deleteAction(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
