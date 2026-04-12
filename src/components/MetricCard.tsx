/**
 * Reusable metric card for dashboards and analytics pages.
 */

import { Card, CardContent, Box, Typography } from '@mui/material'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'

interface MetricCardProps {
  label: string
  value: number | string
  unit?: string
  trend?: 'positive' | 'negative' | null
  subtitle?: string
}

export default function MetricCard({ label, value, unit = '', trend, subtitle }: MetricCardProps) {
  const color = trend === 'positive' ? '#16a34a' : trend === 'negative' ? '#dc2626' : '#64748b'
  const Icon = trend === 'positive' ? TrendingUpIcon : trend === 'negative' ? TrendingDownIcon : null

  return (
    <Card variant="outlined">
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1} minWidth={0}>
            <Typography variant="caption" color="text.secondary" fontWeight={500} display="block" noWrap>
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>
              {value}
              {unit && (
                <Typography component="span" variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>
                  {unit}
                </Typography>
              )}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {Icon && <Icon sx={{ color, fontSize: 22, opacity: 0.6, flexShrink: 0 }} />}
        </Box>
      </CardContent>
    </Card>
  )
}
