import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

type Severity = 'success' | 'error' | 'warning' | 'info'

interface SnackbarMessage {
  message: string
  severity: Severity
  key: number
}

interface SnackbarContextValue {
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showWarning: (message: string) => void
  showInfo: (message: string) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<SnackbarMessage[]>([])
  const [current, setCurrent] = useState<SnackbarMessage | null>(null)
  const [open, setOpen] = useState(false)

  const show = useCallback((message: string, severity: Severity) => {
    const item: SnackbarMessage = { message, severity, key: Date.now() }
    setQueue((q) => [...q, item])
  }, [])

  // Drain queue when snackbar closes
  React.useEffect(() => {
    if (!open && queue.length > 0) {
      const [next, ...rest] = queue
      setCurrent(next)
      setQueue(rest)
      setOpen(true)
    }
  }, [open, queue])

  const handleClose = (_: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return
    setOpen(false)
  }

  const showSuccess = useCallback((m: string) => show(m, 'success'), [show])
  const showError = useCallback((m: string) => show(m, 'error'), [show])
  const showWarning = useCallback((m: string) => show(m, 'warning'), [show])
  const showInfo = useCallback((m: string) => show(m, 'info'), [show])

  const value = useMemo<SnackbarContextValue>(
    () => ({ showSuccess, showError, showWarning, showInfo }),
    [showSuccess, showError, showWarning, showInfo]
  )

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={open}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 8, sm: 2 } }} // above mobile bottom nav
      >
        <Alert
          onClose={handleClose}
          severity={current?.severity ?? 'info'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) throw new Error('useSnackbar must be used within SnackbarProvider')
  return ctx
}
