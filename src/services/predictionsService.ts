import { supabase } from './supabaseClient'
import type { EntryPrediction, EntryPredictionInsert, EntryPredictionUpdate } from '../types/database'

const TABLE = 'entry_predictions'

export async function listPredictionsByEntryId(entryId: string): Promise<EntryPrediction[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('entry_id', entryId)
    .order('end_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntryPrediction[]
}

export async function listAllPredictions(): Promise<EntryPrediction[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntryPrediction[]
}

export async function createPrediction(row: EntryPredictionInsert): Promise<EntryPrediction> {
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw error
  return data as EntryPrediction
}

export async function updatePrediction(id: string, patch: EntryPredictionUpdate): Promise<EntryPrediction> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as EntryPrediction
}

export async function deletePrediction(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
