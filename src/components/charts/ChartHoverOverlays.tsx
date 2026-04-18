/**
 * Shared chart-overlay layer — the crosshair + hover-price pill +
 * committed-measure stats pill used on both the Timeline page and the
 * per-ticker page. Previously the same ~60 lines of positioning code
 * lived inline in both files; one source of truth now.
 *
 * The component is purely presentational — the parent owns the
 * interaction state (crosshairX, measureSelection, drag progress) and
 * hands us the computed geometry. We read just enough to:
 *   - snap the crosshair to the nearest data-point X
 *   - render the hover pill with that point's date + price
 *   - render the measure-stats pill above a committed selection band
 *
 * Why not also render the live drag-overlay band here? TimelinePage
 * manipulates that band imperatively (via a DOM ref + rAF) to avoid
 * React re-rendering hundreds of decision markers during a drag; the
 * TickerTimelineChart does it via React state because it has far
 * fewer markers. Different code paths, different trade-offs —
 * consolidating them would put perf at risk without much LOC win.
 */

import { Box } from '@mui/material'
import MeasureStatsPill from './MeasureStatsPill'
import HoverPricePill from './HoverPricePill'
import type { RangeStats } from '../../utils/chartRangeStats'

export interface ChartHoverOverlaysProps {
  /** Crosshair X position in wrapper-pixel coords; `null` hides the crosshair. */
  crosshairX: number | null
  /** Live drag active — if true we suppress the crosshair/hover to avoid
   *  fighting the drag overlay band. */
  dragActive: boolean
  /** Chart wrapper's pixel width (the Box the mouse handlers attach to). */
  wrapperWidth: number
  /** Plot-area margins matching TimelineChartVisx's internal layout.
   *  Used to translate between wrapper-X and plot-X. */
  plotLeft: number
  plotRight: number
  /** Flat (date, price) array the chart renders. We snap the crosshair
   *  to the nearest index in this array and look up the label payload. */
  chartData: { date: string; price: number }[]
  /** Committed measure selection (post-drag). Null = no measure band. */
  measureSelection: { startIndex: number; endIndex: number } | null
  /** Stats for the measure selection; when present we render the pill. */
  rangeStats: RangeStats | null
}

export default function ChartHoverOverlays({
  crosshairX,
  dragActive,
  wrapperWidth,
  plotLeft,
  plotRight,
  chartData,
  measureSelection,
  rangeStats,
}: ChartHoverOverlaysProps) {
  const plotWidth = wrapperWidth - plotLeft - plotRight

  return (
    <>
      {/* Hover crosshair + HoverPricePill — desktop only (mouse hover never
          fires on touch). Skipped while a measure-drag is active so the
          drag overlay stays visually clean. */}
      {(() => {
        if (crosshairX == null || dragActive || plotWidth <= 0 || chartData.length === 0) return null
        const plotX = Math.max(0, Math.min(plotWidth, crosshairX - plotLeft))
        const idx = Math.max(0, Math.min(chartData.length - 1, Math.round((plotX / plotWidth) * (chartData.length - 1))))
        const pt = chartData[idx]
        if (!pt) return null
        // Snap the crosshair to the resolved data point so the line and
        // the pill label agree visually.
        const snappedX = plotLeft + (idx / Math.max(1, chartData.length - 1)) * plotWidth
        const half = 70
        const clampedLeft = Math.max(plotLeft + half, Math.min(wrapperWidth - plotRight - half, snappedX))
        return (
          <>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: snappedX,
                // MUI treats numeric width in [0,1] as a fraction —
                // `width: 1` renders 100%, not 1 px. Use '1px' so the
                // crosshair is a thin line, not a full band.
                width: '1px',
                pointerEvents: 'none',
                zIndex: 9,
                bgcolor: 'rgba(0,0,0,0.2)',
              }}
            />
            <HoverPricePill left={clampedLeft} date={pt.date} price={pt.price} />
          </>
        )
      })()}

      {/* Committed measure-range stats pill. Centered over the band. */}
      {(() => {
        if (!measureSelection || !rangeStats || wrapperWidth <= 0 || chartData.length === 0) return null
        const tooltipLeft = plotLeft + ((measureSelection.startIndex + measureSelection.endIndex) / 2 / Math.max(1, chartData.length)) * plotWidth
        const half = 84
        const adjustedLeft = Math.max(half, Math.min(wrapperWidth - half, tooltipLeft))
        return <MeasureStatsPill stats={rangeStats} left={adjustedLeft} />
      })()}
    </>
  )
}
