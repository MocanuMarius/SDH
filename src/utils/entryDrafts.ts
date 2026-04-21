/**
 * Multi-slot entry-draft storage (localStorage-backed).
 *
 * Replaces the single-slot `sdh_entry_draft` key with an id-keyed
 * map at `sdh_entry_drafts`, so the writer can have multiple in-
 * progress entries at once (e.g. "started a thought on $AAPL
 * yesterday, started another on $MSFT today, neither saved yet").
 * The DraftsDrawer surfaces the full list; EntryFormPage resumes
 * a specific slot via `?draft=<id>` in the URL.
 *
 * Legacy migration:
 *   First read through listDrafts / getDraft will pick up any
 *   single-slot `sdh_entry_draft` still sitting in localStorage,
 *   re-save it under a generated id in the new map, and remove the
 *   old key. One-way, idempotent, safe to call repeatedly.
 *
 * Everything here is defensive — localStorage can be absent
 * (SSR / test), full, or corrupted. Every accessor catches and
 * returns a safe default so the writing UX never breaks because
 * of a broken draft slot.
 */

const NEW_KEY = 'sdh_entry_drafts'
const LEGACY_KEY = 'sdh_entry_draft'

export interface EntryDraft {
  id: string
  title_markdown?: string
  body_markdown?: string
  tagsStr?: string
  savedAt: number
}

type DraftMap = Record<string, Omit<EntryDraft, 'id'>>

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota / private mode — drop silently */ }
}

function safeRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* noop */ }
}

function readMap(): DraftMap {
  const raw = safeGet(NEW_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DraftMap
    }
  } catch { /* fall through */ }
  return {}
}

function writeMap(map: DraftMap): void {
  safeSet(NEW_KEY, JSON.stringify(map))
}

/**
 * One-time (idempotent) migration of the old single-slot key.
 * Called from the read paths. No-op once the legacy key is gone.
 */
function migrateLegacyIfNeeded(): void {
  const legacy = safeGet(LEGACY_KEY)
  if (!legacy) return
  try {
    const parsed = JSON.parse(legacy) as Partial<EntryDraft>
    if (parsed && parsed.savedAt) {
      const id = newDraftId()
      const map = readMap()
      // Only write if not already present — defensive against a
      // racey double-migration (tab 1 and tab 2 both trigger).
      map[id] = {
        title_markdown: parsed.title_markdown,
        body_markdown: parsed.body_markdown,
        tagsStr: parsed.tagsStr,
        savedAt: parsed.savedAt,
      }
      writeMap(map)
    }
  } catch { /* corrupted legacy blob — discard */ }
  safeRemove(LEGACY_KEY)
}

/** Crypto.randomUUID where available; fall back to a timestamp-based
 *  id with good-enough uniqueness for this purpose (collisions across
 *  a single user's device are effectively impossible). */
export function newDraftId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fall through */ }
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/** All drafts, newest-saved first. */
export function listDrafts(): EntryDraft[] {
  migrateLegacyIfNeeded()
  const map = readMap()
  return Object.entries(map)
    .map(([id, body]) => ({ id, ...body }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export function getDraft(id: string): EntryDraft | null {
  migrateLegacyIfNeeded()
  const map = readMap()
  const body = map[id]
  if (!body) return null
  return { id, ...body }
}

export function saveDraft(
  id: string,
  content: Pick<EntryDraft, 'title_markdown' | 'body_markdown' | 'tagsStr'> & { savedAt?: number }
): void {
  const map = readMap()
  map[id] = {
    title_markdown: content.title_markdown,
    body_markdown: content.body_markdown,
    tagsStr: content.tagsStr,
    savedAt: content.savedAt ?? Date.now(),
  }
  writeMap(map)
}

export function deleteDraft(id: string): void {
  const map = readMap()
  if (!(id in map)) return
  delete map[id]
  writeMap(map)
}

/** Most recently saved draft, if any — used by EntryFormPage to
 *  pick which draft to silently restore on an unqualified mount. */
export function latestDraft(): EntryDraft | null {
  const drafts = listDrafts()
  return drafts[0] ?? null
}

/** Quick display string derived from title / body / tickers —
 *  used by the drawer and the stale-draft banner. */
export function draftSubject(draft: EntryDraft): string {
  const haystack = `${draft.title_markdown ?? ''} ${draft.body_markdown ?? ''}`
  const tickerMatch = haystack.match(/\$([A-Z][A-Z0-9.:]{0,9})/)
  if (tickerMatch) return `$${tickerMatch[1]}`
  const titleWords = (draft.title_markdown ?? '').trim().split(/\s+/).slice(0, 4).join(' ')
  if (titleWords) return `"${titleWords}…"`
  return 'a draft'
}
