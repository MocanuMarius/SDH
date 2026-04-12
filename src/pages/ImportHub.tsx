/**
 * Unified Import page — combines Broker Import, CSV Import, and IBKR Transactions
 * under one tabbed layout.
 */
import { useState, lazy, Suspense } from 'react'
import { Box, Typography, Tabs, Tab, CircularProgress } from '@mui/material'

const BrokerImportPage = lazy(() => import('./BrokerImportPage'))
const ImportPage = lazy(() => import('./ImportPage'))
const IbkrTransactionsPage = lazy(() => import('./IbkrTransactionsPage'))

function TabFallback() {
  return (
    <Box display="flex" justifyContent="center" py={4}>
      <CircularProgress size={24} />
    </Box>
  )
}

export default function ImportHub() {
  const [tab, setTab] = useState(0)

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
        Import
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          mb: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.85rem' },
        }}
      >
        <Tab label="Broker" />
        <Tab label="CSV" />
        <Tab label="IBKR History" />
      </Tabs>

      <Suspense fallback={<TabFallback />}>
        {tab === 0 && <BrokerImportPage />}
        {tab === 1 && <ImportPage />}
        {tab === 2 && <IbkrTransactionsPage />}
      </Suspense>
    </Box>
  )
}
