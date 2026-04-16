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
      // Don't refetch every render — 30s is fine for a personal journal
      staleTime: 30_000,
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
