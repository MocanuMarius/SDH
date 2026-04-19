import { supabase } from './supabaseClient'
import type { Outcome, OutcomeInsert, OutcomeUpdate } from '../types/database'
import type { Action } from '../types/database'

// Re-export so `ResolveStaleIdeaDialog` (and any future caller that
// only knows about the service module) can grab the type without
// reaching into `../types/database`.
export type { OutcomeInsert }

const TABLE = 'outcomes'

/** Get ticker for an outcome via its action (outcomes have no ticker column). */
export function getTickerForOutcome(outcome: Outcome, actionsById: Map<string, Action>): string | null {
  const action = actionsById.get(outcome.action_id)
  return action?.ticker?.trim() ?? null
}

export async function listOutcomes(): Promise<Outcome[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('outcome_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Outcome[]
}

export async function getOutcomeByActionId(actionId: string): Promise<Outcome | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('action_id', actionId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as Outcome
}

export async function getOutcomesForActionIds(actionIds: string[]): Promise<Outcome[]> {
  if (actionIds.length === 0) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('action_id', actionIds)
  if (error) throw error
  return (data ?? []) as Outcome[]
}

export async function createOutcome(row: OutcomeInsert): Promise<Outcome> {
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw error
  return data as Outcome
}

export async function updateOutcome(id: string, patch: OutcomeUpdate): Promise<Outcome> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Outcome
}

export async function deleteOutcome(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
