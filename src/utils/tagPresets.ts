/**
 * User-defined entry tag presets (stored in localStorage).
 * Supports optional per-tag color for visual identification.
 */

const STORAGE_KEY = 'sdh_tag_presets_v2'
const LEGACY_KEY = 'sdh_tag_presets'

export interface TagPreset {
  label: string
  color?: string
}

function migrate(): TagPreset[] {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return []
    const parsed = JSON.parse(legacy) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((label) => ({ label }))
  } catch {
    return []
  }
}

export function getTagPresets(): TagPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Migrate from legacy plain-string format
      const migrated = migrate()
      if (migrated.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      }
      return migrated
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is TagPreset =>
        typeof x === 'object' && x !== null && typeof (x as TagPreset).label === 'string'
    )
  } catch {
    return []
  }
}

export function setTagPresets(presets: TagPreset[]): void {
  const deduped = presets.filter((p, i, arr) => arr.findIndex((q) => q.label === p.label) === i)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped))
}

export function addTagPreset(label: string, color?: string): void {
  const l = label.trim()
  if (!l) return
  const current = getTagPresets()
  if (current.some((p) => p.label === l)) return
  setTagPresets([...current, { label: l, color }])
}

export function updateTagPresetColor(label: string, color: string): void {
  const current = getTagPresets()
  setTagPresets(current.map((p) => (p.label === label ? { ...p, color } : p)))
}

export function removeTagPreset(label: string): void {
  setTagPresets(getTagPresets().filter((p) => p.label !== label))
}

export function removeTagPresetAtIndex(index: number): void {
  const current = getTagPresets()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((_, i) => i !== index)))
}

export function getTagColor(label: string): string | undefined {
  return getTagPresets().find((p) => p.label === label)?.color
}
