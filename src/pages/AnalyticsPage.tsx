/**
 * Unified Analytics page — combines Overview, Performance, and Calibration
 * in a tabbed layout so users have one destination for all performance data.
 * Each tab remounts on switch to ensure fresh data.
 */
import { useState, lazy, Suspense } from 'react'
import { Box, Typography, Tabs, Tab, CircularProgress } from '@mui/material'

const AnalyticsDashboardPage = lazy(() => import('./AnalyticsDashboardPage'))
const InsightsPage = lazy(() => import('./InsightsPage'))
const CalibrationDashboardPage = lazy(() => import('./CalibrationDashboardPage'))

function TabFallback() {
  return (
    <Box display="flex" justifyContent="center" py={4}>
      <CircularProgress size={24} />
    </Box>
  )
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState(0)
  // Counter forces remount when tab is re-selected (ensures data freshness)
  const [mountKey, setMountKey] = useState(0)

  const handleTabChange = (_: unknown, v: number) => {
    setTab(v)
    setMountKey((k) => k + 1)
  }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
        Analytics
      </Typography>
      <Tabs
        value={tab}
        onChange={handleTabChange}
        sx={{
          mb: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.85rem' },
        }}
      >
        <Tab label="Overview" />
        <Tab label="Performance" />
        <Tab label="Calibration" />
      </Tabs>

      <Suspense fallback={<TabFallback />}>
        {tab === 0 && <AnalyticsDashboardPage key={`overview-${mountKey}`} />}
        {tab === 1 && <InsightsPage key={`perf-${mountKey}`} />}
        {tab === 2 && <CalibrationDashboardPage key={`cal-${mountKey}`} />}
      </Suspense>
    </Box>
  )
}
