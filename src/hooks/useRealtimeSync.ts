/**
 * Realtime cross-tab sync via Supabase `postgres_changes`.
 *
 * Subscribes once per signed-in session to changes on tables we care about.
 * When a row insert/update/delete is observed (originating from this tab OR
 * another tab/device under the same user), we invalidate the matching
 * React Query keys so every open page refetches its slice.
 *
 * Combined with `staleTime: 0` + `refetchOnMount: 'always'` in main.tsx, this
 * gives us live cross-tab consistency without polling.
 *
 * Requires Supabase realtime publication on the relevant tables — see
 * `supabase/migrations/20260417130000_enable_realtime.sql`.
 *
 * Implementation note: we use `useQueryClient()` (stable identity) directly
 * rather than `useInvalidate()` (returns a fresh object each render) so the
 * subscription effect fires once per userId change, not on every render.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../services/supabaseClient'

export function useRealtimeSync(userId: string | null | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const inv = (key: readonly string[]) => qc.invalidateQueries({ queryKey: key })

    const channel = supabase
      .channel(`db-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'actions', filter: `user_id=eq.${userId}` },
        () => {
          inv(['actions'])
          inv(['entries', 'withActions'])
          inv(['analytics'])
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${userId}` },
        () => {
          inv(['entries'])
          inv(['analytics'])
        },
      )
      .on(
        'postgres_changes',
        // outcomes don't have user_id; realtime doesn't support join filters,
        // so we accept some over-fetching: any outcome row triggers a refetch.
        { event: '*', schema: 'public', table: 'outcomes' },
        () => {
          inv(['outcomes'])
          inv(['entries', 'withActions'])
          inv(['analytics'])
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passed', filter: `user_id=eq.${userId}` },
        () => inv(['passed']),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entry_predictions' },
        () => {
          inv(['predictions'])
          inv(['analytics'])
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders', filter: `user_id=eq.${userId}` },
        () => inv(['reminders']),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, qc])
}
