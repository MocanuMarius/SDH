/** Generate a short unique id for entry_id (Journalytic-compatible). */
export function generateEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
