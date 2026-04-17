/**
 * Centralized react-query hooks for all server data.
 *
 * Pattern:
 *   - Query keys are namespaced: ['entries'], ['actions', 'entry', id], etc.
 *   - All pages read via these hooks instead of useEffect+useState.
 *   - After mutations, invalidate the relevant key prefix so every component using
 *     that data refetches automatically.
 *
 * Why a single file: keeps key naming consistent and discoverable.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listEntries, listEntriesWithActions, getEntry } from '../services/entriesService'
import { listActions, listActionsByEntryId } from '../services/actionsService'
import { listOutcomes, getOutcomesForActionIds } from '../services/outcomesService'
import { listPredictionsByEntryId } from '../services/predictionsService'
import { listFeelingsByEntryId } from '../services/feelingsService'
import { listReminders } from '../services/remindersService'
import { listPassed, listPassedDueForReview } from '../services/passedService'
import { getValuationByEntryId } from '../services/entryValuationsService'

// ──────────────────────────────────────────────────────────────────────────────
// Query keys — exported so callers can invalidate after mutations
// ──────────────────────────────────────────────────────────────────────────────

export const queryKeys = {
  entries: () => ['entries'] as const,
  entriesWithActions: (opts?: Record<string, unknown>) => ['entries', 'withActions', opts] as const,
  entry: (id: string | undefined) => ['entries', 'one', id] as const,

  actions: () => ['actions'] as const,
  actionsByEntry: (entryId: string | undefined) => ['actions', 'byEntry', entryId] as const,

  outcomes: () => ['outcomes'] as const,
  outcomesByActionIds: (ids: string[]) => ['outcomes', 'byActionIds', [...ids].sort().join(',')] as const,

  predictions: (entryId: string | undefined) => ['predictions', entryId] as const,
  feelings: (entryId: string | undefined) => ['feelings', entryId] as const,

  reminders: () => ['reminders'] as const,
  passed: () => ['passed'] as const,
  passedDueForReview: () => ['passed', 'dueForReview'] as const,

  valuation: (entryId: string | undefined) => ['valuation', entryId] as const,
} as const

// ──────────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────────

export function useEntries(opts?: Parameters<typeof listEntries>[0]) {
  return useQuery({
    queryKey: opts ? ['entries', 'list', opts] : queryKeys.entries(),
    queryFn: () => listEntries(opts),
  })
}

export function useEntriesWithActions(opts?: Parameters<typeof listEntriesWithActions>[0]) {
  return useQuery({
    queryKey: queryKeys.entriesWithActions(opts as Record<string, unknown>),
    queryFn: () => listEntriesWithActions(opts),
  })
}

export function useEntry(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.entry(id),
    queryFn: () => (id ? getEntry(id) : Promise.resolve(null)),
    enabled: !!id,
  })
}

export function useActions(opts?: Parameters<typeof listActions>[0]) {
  return useQuery({
    queryKey: opts ? ['actions', 'list', opts] : queryKeys.actions(),
    queryFn: () => listActions(opts),
  })
}

export function useActionsByEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.actionsByEntry(entryId),
    queryFn: () => (entryId ? listActionsByEntryId(entryId) : Promise.resolve([])),
    enabled: !!entryId,
  })
}

export function useOutcomes() {
  return useQuery({
    queryKey: queryKeys.outcomes(),
    queryFn: () => listOutcomes(),
  })
}

export function useOutcomesByActionIds(actionIds: string[]) {
  return useQuery({
    queryKey: queryKeys.outcomesByActionIds(actionIds),
    queryFn: () => (actionIds.length ? getOutcomesForActionIds(actionIds) : Promise.resolve([])),
    enabled: actionIds.length > 0,
  })
}

export function usePredictions(entryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.predictions(entryId),
    queryFn: () => (entryId ? listPredictionsByEntryId(entryId) : Promise.resolve([])),
    enabled: !!entryId,
  })
}

export function useFeelings(entryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.feelings(entryId),
    queryFn: () => (entryId ? listFeelingsByEntryId(entryId) : Promise.resolve([])),
    enabled: !!entryId,
  })
}

export function useReminders(onlyActive = true) {
  return useQuery({
    queryKey: [...queryKeys.reminders(), onlyActive],
    queryFn: () => listReminders(onlyActive),
  })
}

export function usePassed() {
  return useQuery({
    queryKey: queryKeys.passed(),
    queryFn: () => listPassed(),
  })
}

export function usePassedDueForReview() {
  return useQuery({
    queryKey: queryKeys.passedDueForReview(),
    queryFn: () => listPassedDueForReview(),
  })
}

export function useValuation(entryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.valuation(entryId),
    queryFn: () => (entryId ? getValuationByEntryId(entryId) : Promise.resolve(null)),
    enabled: !!entryId,
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Invalidation helpers — call these from mutation handlers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a function that invalidates EVERY query that touches a given entity type.
 * Use after any create/update/delete to make all dependent views refetch.
 */
export function useInvalidate() {
  const qc = useQueryClient()
  return {
    /** Invalidate every entries query (list, withActions, single). */
    entries: () => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
    /** Invalidate every actions query (list, by entry, by ticker). */
    actions: () => {
      qc.invalidateQueries({ queryKey: ['actions'] })
      // Actions appear in entries-with-actions too
      qc.invalidateQueries({ queryKey: ['entries', 'withActions'] })
      // Analytics aggregates roll up actions; keep them in sync.
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
    /** Invalidate outcomes queries. Outcomes also affect entries-with-actions badges. */
    outcomes: () => {
      qc.invalidateQueries({ queryKey: ['outcomes'] })
      qc.invalidateQueries({ queryKey: ['entries', 'withActions'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
    /** Invalidate predictions for a specific entry (or all if no id). */
    predictions: (entryId?: string) => {
      if (entryId) qc.invalidateQueries({ queryKey: queryKeys.predictions(entryId) })
      else qc.invalidateQueries({ queryKey: ['predictions'] })
      // Calibration analytics roll up predictions — keep that in sync.
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
    /** Invalidate feelings for a specific entry (or all if no id). */
    feelings: (entryId?: string) => {
      if (entryId) qc.invalidateQueries({ queryKey: queryKeys.feelings(entryId) })
      else qc.invalidateQueries({ queryKey: ['feelings'] })
    },
    /** Invalidate reminders + the activity badge count. */
    reminders: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
    },
    passed: () => {
      qc.invalidateQueries({ queryKey: ['passed'] })
    },
    valuation: (entryId?: string) => {
      if (entryId) qc.invalidateQueries({ queryKey: queryKeys.valuation(entryId) })
      else qc.invalidateQueries({ queryKey: ['valuation'] })
    },
    /** Nuke everything — useful after bulk operations like CSV import. */
    all: () => qc.invalidateQueries(),
  }
}
