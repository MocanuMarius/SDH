/**
 * URL-safe state encoding helpers.
 *
 * Each page serialises its full interactive state (range, zoom, filters,
 * selection, tabs, …) into a single compact `?s=<blob>` query param so
 * any view can be deep-linked. Chosen format is JSON → URL-safe base64:
 *
 *   - JSON.stringify keeps structure the page already uses internally
 *   - base64 shrinks the URL enough that every character in a long
 *     selection or zoom range isn't visible to the user
 *   - URL-safe tweaks (+→-, /→_, no =) keep it copy-pasteable
 *
 * If states start getting >~400 chars in practice, swap the btoa step
 * for lz-string — same shape, 2-3× more compact.
 */

/** JSON-serialise `obj` and encode to URL-safe base64. Returns '' if the
 *  input can't be stringified (e.g. circular refs). */
export function encodeUrlState(obj: unknown): string {
  try {
    const json = JSON.stringify(obj)
    if (json === undefined || json === '{}' || json === 'null') return ''
    // btoa doesn't handle multi-byte chars; round-trip through UTF-8 first.
    const utf8 = unescape(encodeURIComponent(json))
    return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    return ''
  }
}

/** Decode a URL-safe base64 blob back to the original object. Returns
 *  `null` on any decode / parse error so callers fall back to defaults. */
export function decodeUrlState<T>(encoded: string | null | undefined): T | null {
  if (!encoded) return null
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const utf8 = atob(padded)
    const json = decodeURIComponent(escape(utf8))
    const parsed = JSON.parse(json)
    return parsed as T
  } catch {
    return null
  }
}
