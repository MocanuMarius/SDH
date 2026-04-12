/**
 * Minimal service worker for Deecide PWA.
 * Required for: installability (Add to Home Screen) and Share Target API.
 * No offline caching — the app requires network for Supabase anyway.
 */

const CACHE_NAME = 'deecide-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Share Target: intercept GET /share-target and redirect to /entries/new with params
  const url = new URL(event.request.url)
  if (url.pathname === '/share-target') {
    const title = url.searchParams.get('title') || ''
    const text = url.searchParams.get('text') || ''
    const sharedUrl = url.searchParams.get('url') || ''
    const dest = new URL('/entries/new', url.origin)
    dest.searchParams.set('shared', '1')
    if (title) dest.searchParams.set('title', title)
    if (text) dest.searchParams.set('text', text)
    if (sharedUrl) dest.searchParams.set('url', sharedUrl)
    event.respondWith(Response.redirect(dest.toString(), 303))
    return
  }
  // Network-first for everything else (no offline support)
  event.respondWith(fetch(event.request))
})
