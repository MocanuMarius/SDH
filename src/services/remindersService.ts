import { supabase } from './supabaseClient'
import type { Reminder, ReminderInsert } from '../types/database'

const TABLE = 'reminders'

export async function listReminders(onlyActive = true): Promise<Reminder[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .order('reminder_date', { ascending: true })
  if (onlyActive) {
    q = q.is('completed_at', null)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Reminder[]
}

export async function createReminder(userId: string, row: Omit<ReminderInsert, 'user_id'>): Promise<Reminder> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      entry_id: row.entry_id ?? null,
      type: row.type,
      reminder_date: row.reminder_date,
      note: row.note ?? '',
      ticker: row.ticker ?? '',
      completed_at: null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Reminder
}

export async function completeReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
