/**
 * Analytics — two URL-routed tabs:
 *
 *   /analytics             → Performance (all decisions + closed-trade widgets)
 *   /analytics/calibration → Calibration  (prediction accuracy)
 *
 * The old "Overview" tab was dropped — its two genuinely useful pieces
 * (Win Rate tile + Process×Outcome matrix) now sit at the top of the
 * Performance tab so users aren't flipping between tabs just to see
 * closed-trade quality metrics alongside everything else.
 */
import { lazy, Suspense } from 'react'
import { Box, Tabs, Tab, CircularProgress } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { PageHeader } from '../components/system'

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
  const { pathname } = useLocation()
  // Path-driven tab: /analytics/calibration → tab 1, everything else → tab 0.
  const activeTab: number = pathname === '/analytics/calibration' ? 1 : 0

  return (
    <Box>
      <PageHeader
        title="Analytics"
        dek="Performance, calibration, and overall journaling stats — all live from your structured decisions."
        dense
      />
      <Tabs
        value={activeTab}
        sx={{
          mb: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontSize: '0.85rem' },
        }}
      >
        <Tab label="Performance" component={RouterLink} to="/analytics" />
        <Tab label="Calibration" component={RouterLink} to="/analytics/calibration" />
      </Tabs>

      <Suspense fallback={<TabFallback />}>
        {activeTab === 0 && <InsightsPage />}
        {activeTab === 1 && <CalibrationDashboardPage />}
      </Suspense>
    </Box>
  )
}
