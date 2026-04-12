import { useMemo, useState, useCallback, useRef } from 'react'
import { Group } from '@visx/group'
import { LinePath, AreaClosed } from '@visx/shape'
import { scaleTime, scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { LinearGradient } from '@visx/gradient'
import { ParentSize } from '@visx/responsive'
import { Brush } from '@visx/brush'
import type { Bounds } from '@visx/brush/lib/types'
import { curveMonotoneX } from '@visx/curve'
import { Box, Typography } from '@mui/material'
import { calculateCAGR } from '../services/analyticsService'
import type { OutcomeAnalytics } from '../types/analytics'

type DataPoint = { date: Date; value: number }

const MAIN_H = 200
const BRUSH_H = 55
const MARGIN = { top: 20, right: 20, bottom: 35, left: 72 }
const BRUSH_MARGIN = { top: 8, right: 20, bottom: 24, left: 72 }

const getDate = (d: DataPoint) => d.date
const getValue = (d: DataPoint) => d.value

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

interface Props {
  outcomes: OutcomeAnalytics[]
  onRangeChange?: (start: Date | null, end: Date | null) => void
}

export default function CagrBrushChart({ outcomes, onRangeChange }: Props) {
  const [brushDomain, setBrushDomain] = useState<{ start: Date; end: Date } | null>(null)
  const brushRef = useRef(null)

  // Build cumulative P&L time-series
  const allData = useMemo((): DataPoint[] => {
    if (outcomes.length === 0) return []
    const sorted = [...outcomes].sort(
      (a, b) => new Date(a.outcomeDate).getTime() - new Date(b.outcomeDate).getTime()
    )
    let cum = 0
    const pts: DataPoint[] = [{ date: new Date(sorted[0].decisionDate), value: 0 }]
    for (const o of sorted) {
      cum += o.realizedPnl
      pts.push({ date: new Date(o.outcomeDate), value: cum })
    }
    return pts
  }, [outcomes])

  // Outcomes within the selected range
  const selectedOutcomes = useMemo(() => {
    if (!brushDomain) return outcomes
    return outcomes.filter((o) => {
      const d = new Date(o.outcomeDate)
      return d >= brushDomain.start && d <= brushDomain.end
    })
  }, [outcomes, brushDomain])

  const selectedCagr = useMemo(() => {
    if (selectedOutcomes.length === 0) return null
    const c = calculateCAGR(
      selectedOutcomes,
      brushDomain?.start.toISOString().split('T')[0],
      brushDomain?.end.toISOString().split('T')[0]
    )
    return c === 0 ? null : c
  }, [selectedOutcomes, brushDomain])

  const selectedPnl = useMemo(
    () => selectedOutcomes.reduce((acc, o) => acc + o.realizedPnl, 0),
    [selectedOutcomes]
  )

  // Points visible in the main chart (within brush selection)
  const mainData = useMemo(() => {
    if (!brushDomain || allData.length === 0) return allData
    const filtered = allData.filter(
      (d) => d.date >= brushDomain.start && d.date <= brushDomain.end
    )
    return filtered.length >= 2 ? filtered : allData
  }, [allData, brushDomain])

  const onBrushChange = useCallback((domain: Bounds | null) => {
    if (!domain) {
      setBrushDomain(null)
      onRangeChange?.(null, null)
      return
    }
    const start = new Date(domain.x0)
    const end = new Date(domain.x1)
    setBrushDomain({ start, end })
    onRangeChange?.(start, end)
  }, [onRangeChange])

  if (allData.length < 2) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Not enough data to display chart. Record at least 2 outcomes to enable the CAGR chart.
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Metrics row */}
      <Box sx={{ display: 'flex', gap: 4, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            CAGR {brushDomain ? '(selected)' : '(all time)'}
          </Typography>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ color: selectedCagr == null ? '#94a3b8' : selectedCagr > 0 ? '#16a34a' : '#dc2626' }}
          >
            {selectedCagr == null ? 'N/A' : fmtPct(selectedCagr)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Realized P&L {brushDomain ? '(selected)' : '(all time)'}
          </Typography>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ color: selectedPnl > 0 ? '#16a34a' : selectedPnl < 0 ? '#dc2626' : '#64748b' }}
          >
            {selectedPnl >= 0 ? '+' : ''}{fmt.format(selectedPnl)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Trades {brushDomain ? '(selected)' : '(all time)'}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {selectedOutcomes.length}
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Drag the brush below to select a date range and see CAGR for that period.
        {selectedCagr == null && selectedOutcomes.length > 0 && ' CAGR requires entries with price & share data.'}
      </Typography>

      <ParentSize>
        {({ width }) => {
          if (width < 80) return null

          const xMax = width - MARGIN.left - MARGIN.right
          const yMax = MAIN_H - MARGIN.top - MARGIN.bottom
          const xBrushMax = width - BRUSH_MARGIN.left - BRUSH_MARGIN.right
          const yBrushMax = BRUSH_H - BRUSH_MARGIN.top - BRUSH_MARGIN.bottom

          if (xMax <= 0 || yMax <= 0) return null

          const allDates = allData.map(getDate)
          const dateExtent: [Date, Date] = [
            new Date(Math.min(...allDates.map((d) => d.getTime()))),
            new Date(Math.max(...allDates.map((d) => d.getTime()))),
          ]

          // Main chart x/y using filtered (brush) data
          const xScale = scaleTime({
            domain: brushDomain ? [brushDomain.start, brushDomain.end] : dateExtent,
            range: [0, xMax],
          })

          const mainValues = mainData.map(getValue)
          const mainMin = Math.min(0, ...mainValues)
          const mainMax = Math.max(0, ...mainValues)
          const mainPad = (mainMax - mainMin) * 0.1 || 1000
          const yScale = scaleLinear({
            domain: [mainMin - mainPad, mainMax + mainPad],
            range: [yMax, 0],
            nice: true,
          })

          // Brush chart scales (always full range)
          const xBrushScale = scaleTime({ domain: dateExtent, range: [0, xBrushMax] })
          const allValues = allData.map(getValue)
          const allMin = Math.min(0, ...allValues)
          const allMax = Math.max(0, ...allValues)
          const yBrushScale = scaleLinear({
            domain: [allMin - (allMax - allMin) * 0.1 - 1, allMax + (allMax - allMin) * 0.1 + 1],
            range: [yBrushMax, 0],
          })

          // Default brush: whole range
          const brushInit = {
            start: { x: xBrushScale(dateExtent[0]) },
            end: { x: xBrushScale(dateExtent[1]) },
          }

          const isPositive = mainValues[mainValues.length - 1] >= 0
          const lineColor = isPositive ? '#2563eb' : '#dc2626'

          const totalH =
            MARGIN.top +
            yMax +
            MARGIN.bottom +
            BRUSH_MARGIN.top +
            yBrushMax +
            BRUSH_MARGIN.bottom

          return (
            <svg width={width} height={totalH} style={{ overflow: 'visible' }}>
              <LinearGradient
                id="area-up"
                from="#2563eb"
                to="#2563eb"
                fromOpacity={0.25}
                toOpacity={0.02}
                vertical
              />
              <LinearGradient
                id="area-down"
                from="#dc2626"
                to="#dc2626"
                fromOpacity={0.25}
                toOpacity={0.02}
                vertical
              />
              <LinearGradient
                id="brush-area"
                from="#64748b"
                to="#64748b"
                fromOpacity={0.2}
                toOpacity={0.02}
                vertical
              />

              {/* ── Main chart ── */}
              <Group top={MARGIN.top} left={MARGIN.left}>
                <GridRows
                  scale={yScale}
                  width={xMax}
                  numTicks={5}
                  stroke="#e2e8f0"
                  strokeDasharray="3,3"
                />

                <AreaClosed
                  data={mainData}
                  x={(d) => xScale(getDate(d))}
                  y={(d) => yScale(getValue(d))}
                  yScale={yScale}
                  curve={curveMonotoneX}
                  fill={isPositive ? 'url(#area-up)' : 'url(#area-down)'}
                />

                <LinePath
                  data={mainData}
                  x={(d) => xScale(getDate(d))}
                  y={(d) => yScale(getValue(d))}
                  curve={curveMonotoneX}
                  stroke={lineColor}
                  strokeWidth={2}
                />

                {/* Zero baseline */}
                <line
                  x1={0}
                  x2={xMax}
                  y1={yScale(0)}
                  y2={yScale(0)}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />

                <AxisLeft
                  scale={yScale}
                  numTicks={5}
                  tickFormat={(v) => fmt.format(Number(v))}
                  tickLabelProps={{ fontSize: 10, fill: '#64748b', textAnchor: 'end', dx: -4 }}
                  stroke="#e2e8f0"
                  tickStroke="transparent"
                />
                <AxisBottom
                  top={yMax}
                  scale={xScale}
                  numTicks={Math.min(6, mainData.length)}
                  tickFormat={(v) => formatDate(v as Date)}
                  tickLabelProps={{ fontSize: 10, fill: '#64748b', textAnchor: 'middle' }}
                  stroke="#e2e8f0"
                  tickStroke="#e2e8f0"
                />
              </Group>

              {/* ── Brush chart ── */}
              <Group
                top={MARGIN.top + yMax + MARGIN.bottom + BRUSH_MARGIN.top}
                left={BRUSH_MARGIN.left}
              >
                <AreaClosed
                  data={allData}
                  x={(d) => xBrushScale(getDate(d))}
                  y={(d) => yBrushScale(getValue(d))}
                  yScale={yBrushScale}
                  curve={curveMonotoneX}
                  fill="url(#brush-area)"
                />
                <LinePath
                  data={allData}
                  x={(d) => xBrushScale(getDate(d))}
                  y={(d) => yBrushScale(getValue(d))}
                  curve={curveMonotoneX}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                />
                {/* Zero baseline in brush */}
                <line
                  x1={0}
                  x2={xBrushMax}
                  y1={yBrushScale(0)}
                  y2={yBrushScale(0)}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
                <AxisBottom
                  top={yBrushMax}
                  scale={xBrushScale}
                  numTicks={4}
                  tickFormat={(v) => formatDate(v as Date)}
                  tickLabelProps={{ fontSize: 9, fill: '#94a3b8', textAnchor: 'middle' }}
                  stroke="#e2e8f0"
                  tickStroke="transparent"
                />
                <Brush
                  xScale={xBrushScale}
                  yScale={yBrushScale}
                  width={xBrushMax}
                  height={yBrushMax}
                  margin={BRUSH_MARGIN}
                  handleSize={8}
                  innerRef={brushRef}
                  resizeTriggerAreas={['left', 'right']}
                  brushDirection="horizontal"
                  initialBrushPosition={brushInit}
                  onChange={onBrushChange}
                  onClick={() => { setBrushDomain(null); onRangeChange?.(null, null) }}
                  selectedBoxStyle={{
                    fill: '#2563eb',
                    fillOpacity: 0.08,
                    stroke: '#2563eb',
                    strokeWidth: 1,
                    strokeOpacity: 0.6,
                  }}
                  useWindowMoveEvents
                />
              </Group>
            </svg>
          )
        }}
      </ParentSize>
    </Box>
  )
}
