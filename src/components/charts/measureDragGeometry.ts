/**
 * Pure helpers shared by the chart pages' drag-to-measure handlers.
 *
 * Both TimelinePage and TickerTimelineChart need to translate a pair of
 * wrapper-pixel X coordinates (where the user pressed and released the
 * mouse / lifted the finger) into a `{ startIndex, endIndex }` window
 * over the chart's data array. The math is identical — only the way
 * each page tracks the live drag (React state vs imperative ref) is
 * different, so the shared piece is just this geometry computation
 * rather than a full hook.
 */

/** Minimum pixel span before we treat a drag as a deliberate measure
 *  vs a stray click. Same threshold as the existing inline check. */
export const MEASURE_DRAG_MIN_PX = 20

export interface PlotGeometry {
  /** The wrapper Box's current width in pixels. */
  wrapperWidth: number
  /** Plot-area margins matching TimelineChartVisx's internal layout. */
  plotLeft: number
  plotRight: number
  /** Number of points in the chart's data array. */
  dataLength: number
}

/**
 * Translate a drag (start, end wrapper-X) into the data-index window it
 * selects. Returns `null` for drags below the activation threshold or
 * when the geometry would be degenerate (zero-width plot, empty data).
 */
export function computeMeasureSelection(
  startX: number,
  endX: number,
  geom: PlotGeometry,
): { startIndex: number; endIndex: number } | null {
  if (Math.abs(endX - startX) < MEASURE_DRAG_MIN_PX) return null
  const plotWidth = geom.wrapperWidth - geom.plotLeft - geom.plotRight
  if (plotWidth <= 0 || geom.dataLength === 0) return null
  const [x1, x2] = startX < endX ? [startX, endX] : [endX, startX]
  const plotX1 = Math.max(0, x1 - geom.plotLeft)
  const plotX2 = Math.min(plotWidth, x2 - geom.plotLeft)
  const startIndex = Math.max(0, Math.min(Math.floor((plotX1 / plotWidth) * geom.dataLength), geom.dataLength - 1))
  let endIndex = Math.max(0, Math.min(Math.ceil((plotX2 / plotWidth) * geom.dataLength), geom.dataLength - 1))
  if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, geom.dataLength - 1)
  return { startIndex, endIndex }
}
