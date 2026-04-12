import { supabase } from './supabaseClient'
import type { EntryFeeling, EntryFeelingInsert, EntryFeelingUpdate } from '../types/database'

const TABLE = 'entry_feelings'

export async function listFeelingsByEntryId(entryId: string): Promise<EntryFeeling[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntryFeeling[]
}

export async function createFeeling(row: EntryFeelingInsert): Promise<EntryFeeling> {
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw error
  return data as EntryFeeling
}

export async function updateFeeling(id: string, patch: EntryFeelingUpdate): Promise<EntryFeeling> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as EntryFeeling
}

export async function deleteFeeling(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
