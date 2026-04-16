import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Background refetch when window regains focus — catches stale data after multitab use
      refetchOnWindowFocus: true,
      // Always refetch when a screen mounts so navigating to /actions shows the
      // freshest list (the prior 30s stale window was the cause of the
      // "Trades doesn't show my new buy" complaint).
      refetchOnMount: 'always',
      // Treat data as stale immediately after a fetch so any invalidate.X()
      // triggers an actual refetch instead of being a no-op against fresh cache.
      staleTime: 0,
      // Keep cached data around for 5 min after a query unmounts (instant back-nav)
      gcTime: 5 * 60_000,
      // Don't retry failed queries by default — Supabase errors are usually permanent
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
