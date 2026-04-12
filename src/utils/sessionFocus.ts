/**
 * Session training focus — localStorage-backed.
 *
 * Per deliberate-practice R3 ("name the sub-skill before each session"), the
 * user picks a sub-skill they're training during a given practice session.
 * This lightweight store holds that choice for the current day so subsequent
 * entries and predictions can auto-tag it.
 *
 * Auto-expires after 18 hours so an old focus from yesterday doesn't silently
 * contaminate tomorrow's work. Re-picking is a one-click action on the home
 * banner.
 */

import type { SubSkill } from '../types/subSkills'
import { isSubSkill } from '../types/subSkills'

const STORAGE_KEY = 'sdh_session_training_focus'
const EXPIRY_MS = 18 * 60 * 60 * 1000 // 18 hours

interface StoredFocus {
  subSkill: SubSkill
  setAt: number
}

export function getSessionFocus(): SubSkill | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFocus
    if (!isSubSkill(parsed.subSkill)) return null
    if (typeof parsed.setAt !== 'number') return null
    if (Date.now() - parsed.setAt > EXPIRY_MS) {
      // Expired — clear and return null so the UI can re-prompt.
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.subSkill
  } catch {
    return null
  }
}

export function setSessionFocus(subSkill: SubSkill): void {
  const stored: StoredFocus = { subSkill, setAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  // Dispatch a storage event so components in the same tab can react.
  window.dispatchEvent(new Event('sdh-session-focus-changed'))
}

export function clearSessionFocus(): void {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('sdh-session-focus-changed'))
}

/**
 * Subscribe to focus changes. Returns an unsubscribe function.
 * Listens both to our custom in-tab event and to cross-tab storage events.
 */
export function subscribeSessionFocus(callback: () => void): () => void {
  const onChange = () => callback()
  window.addEventListener('sdh-session-focus-changed', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('sdh-session-focus-changed', onChange)
    window.removeEventListener('storage', onChange)
  }
}
