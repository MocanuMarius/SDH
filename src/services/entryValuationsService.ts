import { supabase } from './supabaseClient'
import type { EntryValuation, EntryValuationInsert, EntryValuationUpdate } from '../types/database'

const TABLE = 'entry_valuations'

export async function getValuationByEntryId(entryId: string): Promise<EntryValuation | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('entry_id', entryId)
    .maybeSingle()
  if (error) throw error
  return (data as EntryValuation | null) ?? null
}

export async function upsertValuation(row: EntryValuationInsert): Promise<EntryValuation> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'entry_id' })
    .select()
    .single()
  if (error) throw error
  return data as EntryValuation
}

export async function updateValuation(id: string, patch: EntryValuationUpdate): Promise<EntryValuation> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as EntryValuation
}

export async function deleteValuation(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
