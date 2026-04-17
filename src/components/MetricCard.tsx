/**
 * MetricCard — thin wrapper around the design-system `MetricTile` so existing
 * dashboard call sites keep their API while picking up the newspaper styling.
 */

import MetricTile from './system/MetricTile'

interface MetricCardProps {
  label: string
  value: number | string
  unit?: string
  trend?: 'positive' | 'negative' | null
  subtitle?: string
}

export default function MetricCard({ label, value, unit = '', trend, subtitle }: MetricCardProps) {
  const tone: 'positive' | 'negative' | 'default' =
    trend === 'positive' ? 'positive' : trend === 'negative' ? 'negative' : 'default'
  return (
    <MetricTile
      label={label}
      value={
        unit ? (
          <>
            {value}
            <span style={{ marginLeft: 6, fontSize: '0.6em', color: 'rgba(15,23,42,0.55)', fontFamily: 'inherit' }}>
              {unit}
            </span>
          </>
        ) : (
          value
        )
      }
      hint={subtitle}
      tone={tone}
    />
  )
}
