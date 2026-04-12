/**
 * User-defined custom decision types (stored in localStorage).
 * These extend the built-in ACTION_TYPES with user-specific types + colors.
 */

const STORAGE_KEY = 'sdh_custom_decision_types'

export interface CustomDecisionType {
  id: string
  label: string
  color: string
}

export function getCustomDecisionTypes(): CustomDecisionType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is CustomDecisionType =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as CustomDecisionType).id === 'string' &&
        typeof (x as CustomDecisionType).label === 'string' &&
        typeof (x as CustomDecisionType).color === 'string'
    )
  } catch {
    return []
  }
}

export function setCustomDecisionTypes(types: CustomDecisionType[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
}

export function addCustomDecisionType(label: string, color: string): CustomDecisionType {
  const newType: CustomDecisionType = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: label.trim(),
    color,
  }
  const current = getCustomDecisionTypes()
  setCustomDecisionTypes([...current, newType])
  return newType
}

export function updateCustomDecisionType(id: string, updates: Partial<Pick<CustomDecisionType, 'label' | 'color'>>): void {
  const current = getCustomDecisionTypes()
  setCustomDecisionTypes(current.map((t) => (t.id === id ? { ...t, ...updates } : t)))
}

export function removeCustomDecisionType(id: string): void {
  setCustomDecisionTypes(getCustomDecisionTypes().filter((t) => t.id !== id))
}
