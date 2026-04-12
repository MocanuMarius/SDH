/**
 * ValuationWidget — interactive "3 Engines of Value" sketchpad.
 *
 * Highly graphical. The user:
 *   - Adjusts earnings growth and shareholder yield with sliders.
 *   - Picks a projection horizon (3 / 5 / 7 / 10 years — default 5).
 *   - Drags circular handles on each year of the chart to draw an arbitrary
 *     multiple curve. This lets them model scenarios like "multiple compresses
 *     years 2–3 before rebounding at year 5". The stacked area redraws live
 *     and the headline CAGR updates on every drag.
 *
 * No framework / calibration ties. Saves to `entry_valuations` with a
 * 600ms debounce so dragging is smooth.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  IconButton,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InsightsIcon from '@mui/icons-material/Insights'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { ParentSize } from '@visx/responsive'
import { scaleLinear } from '@visx/scale'
import { AreaClosed, LinePath } from '@visx/shape'
import { LinearGradient } from '@visx/gradient'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveMonotoneX } from '@visx/curve'
import {
  projectEngines,
  resolveMultipleCurve,
  summarizeEngines,
  ENGINE_PRESETS,
  type EngineInputs,
  type EngineYearPoint,
} from '../utils/valuationEngines'
import {
  getValuationByEntryId,
  upsertValuation,
} from '../services/entryValuationsService'
import type { EntryValuation } from '../types/database'

interface Props {
  entryId: string
  defaultExpanded?: boolean
  /** When true, don't render at all if no valuation data exists in the DB */
  hideWhenEmpty?: boolean
}

const DEFAULT_INPUTS: EngineInputs = {
  earningsGrowthPct: 10,
  currentMultiple: 18,
  targetMultiple: 18,
  shareholderYieldPct: 2,
  horizonYears: 5,
}

const HORIZON_OPTIONS = [3, 5, 7, 10]

const COLORS = {
  base: '#64748b',
  earnings: '#16a34a',
  multiple: '#2563eb',
  yield: '#a855f7',
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`
}
function fmtMultiple(n: number): string {
  return `${n.toFixed(1)}x`
}

// ── Chart with draggable multiple handles ─────────────────────────────

interface ChartProps {
  width: number
  height: number
  points: EngineYearPoint[]
  multiples: number[]
  onMultipleChange: (yearIndex: number, newMultiple: number) => void
}

function EnginesStackedChart({ width, height, points, multiples, onMultipleChange }: ChartProps) {
  const [draggingYear, setDraggingYear] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  if (width < 80 || height < 140) return null

  const margin = { top: 14, right: 16, bottom: 28, left: 52 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const totals = points.map((p) => Math.max(0, p.total))
  const maxTotal = Math.max(1.2, ...totals)
  const minTotal = Math.min(1, ...totals)
  const maxMultiple = Math.max(...multiples, 1)

  const xScale = scaleLinear({
    domain: [points[0]?.year ?? 0, points[points.length - 1]?.year ?? 1],
    range: [0, innerW],
  })
  // Anchor the y-axis near the baseline so the chart feels packed rather than
  // leaving half the canvas empty below $1. Give 5% headroom top and 5% below
  // whichever is lower of minTotal or 1.
  const yLow = Math.max(0, Math.min(minTotal, 1) * 0.95)
  const yHigh = maxTotal * 1.08
  const yScale = scaleLinear({
    domain: [yLow, yHigh],
    range: [innerH, 0],
    nice: true,
  })
  // Right-side scale for drawing multiple-curve handles at a readable height.
  // Maps multiple values to the inner y-range so a 0 multiple sits at the
  // bottom and maxMultiple sits near the top.
  const multipleScale = scaleLinear({
    domain: [0, Math.max(1, maxMultiple * 1.2)],
    range: [innerH, 0],
  })

  // Build stacked series (cumulative tops per layer).
  const series = points.map((p) => {
    const earningsTop = 1 + Math.max(0, p.earningsLayer)
    const multipleTop = earningsTop + p.multipleLayer
    const yieldTop = multipleTop + p.yieldLayer
    return {
      year: p.year,
      base: 1,
      earningsTop,
      multipleTop,
      yieldTop,
      total: p.total,
      multiple: p.multiple,
    }
  })

  // ── Drag logic ──────────────────────────────────────────────────
  // Pointer events unify mouse + touch + pen. The handle sets capture on
  // pointerdown; pointermove translates y-delta into a new multiple value;
  // pointerup releases capture and ends drag.

  const toMultiple = (clientY: number): number => {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const yInInner = clientY - rect.top - margin.top
    const m = multipleScale.invert(yInInner)
    // Clamp to reasonable bounds: 0.5..100x
    return Math.max(0.5, Math.min(100, Math.round(m * 2) / 2))
  }

  const handlePointerDown = (yearIdx: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.preventDefault()
    ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
    setDraggingYear(yearIdx)
    onMultipleChange(yearIdx, toMultiple(e.clientY))
  }
  const handlePointerMove = (yearIdx: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingYear !== yearIdx) return
    onMultipleChange(yearIdx, toMultiple(e.clientY))
  }
  const handlePointerUp = (yearIdx: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (draggingYear === yearIdx) {
      ;(e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId)
      setDraggingYear(null)
    }
  }

  return (
    <svg ref={svgRef} width={width} height={height} style={{ display: 'block', touchAction: 'none' }}>
      <LinearGradient id="eng-earnings" from={COLORS.earnings} to={COLORS.earnings} fromOpacity={0.55} toOpacity={0.12} />
      <LinearGradient id="eng-multiple" from={COLORS.multiple} to={COLORS.multiple} fromOpacity={0.55} toOpacity={0.12} />
      <LinearGradient id="eng-yield" from={COLORS.yield} to={COLORS.yield} fromOpacity={0.55} toOpacity={0.12} />

      <g transform={`translate(${margin.left},${margin.top})`}>
        <GridRows scale={yScale} width={innerW} numTicks={4} stroke="#e2e8f0" strokeDasharray="2,3" />

        <line x1={0} y1={yScale(1)} x2={innerW} y2={yScale(1)} stroke="#cbd5e1" strokeDasharray="4,3" />

        {/* Earnings layer */}
        <AreaClosed<(typeof series)[number]>
          data={series}
          x={(d) => xScale(d.year)}
          y={(d) => yScale(d.earningsTop)}
          yScale={yScale}
          y0={() => yScale(1)}
          curve={curveMonotoneX}
          fill="url(#eng-earnings)"
          stroke={COLORS.earnings}
          strokeWidth={1.5}
        />
        {/* Multiple layer — may dip below earningsTop when multiple contracts */}
        <AreaClosed<(typeof series)[number]>
          data={series}
          x={(d) => xScale(d.year)}
          y={(d) => yScale(d.multipleTop)}
          yScale={yScale}
          y0={(d) => yScale(d.earningsTop)}
          curve={curveMonotoneX}
          fill="url(#eng-multiple)"
          stroke={COLORS.multiple}
          strokeWidth={1.5}
        />
        {/* Yield layer */}
        <AreaClosed<(typeof series)[number]>
          data={series}
          x={(d) => xScale(d.year)}
          y={(d) => yScale(d.yieldTop)}
          yScale={yScale}
          y0={(d) => yScale(d.multipleTop)}
          curve={curveMonotoneX}
          fill="url(#eng-yield)"
          stroke={COLORS.yield}
          strokeWidth={1.5}
        />

        {/* Total price trace */}
        <LinePath<(typeof series)[number]>
          data={series}
          x={(d) => xScale(d.year)}
          y={(d) => yScale(d.total)}
          curve={curveMonotoneX}
          stroke="#0f172a"
          strokeWidth={2}
        />

        {/* Per-year markers + rolling CAGR labels on the composite trace.
            Skip Y0 (rolling CAGR is meaningless there). Alternate label offset
            to reduce collisions when horizon is 3-5 years. */}
        {points.map((p, i) => {
          if (i === 0) return null
          const cx = xScale(p.year)
          const cy = yScale(p.total)
          const isLast = i === points.length - 1
          const cagrLabel = `${p.rollingCagr >= 0 ? '+' : ''}${(p.rollingCagr * 100).toFixed(1)}%`
          return (
            <g key={`cagr-${i}`}>
              <circle cx={cx} cy={cy} r={isLast ? 5 : 3} fill="#0f172a" />
              <text
                x={cx}
                y={cy + (i % 2 === 0 ? -10 : 18)}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={p.rollingCagr >= 0 ? '#166534' : '#991b1b'}
                pointerEvents="none"
              >
                {cagrLabel}
              </text>
            </g>
          )
        })}

        {/* ── Multiple curve polyline + draggable handles ── */}
        <LinePath<{ year: number; multiple: number }>
          data={multiples.map((m, i) => ({ year: i, multiple: m }))}
          x={(d) => xScale(d.year)}
          y={(d) => multipleScale(d.multiple)}
          curve={curveMonotoneX}
          stroke={COLORS.multiple}
          strokeWidth={2.5}
          strokeDasharray="5,3"
          fill="none"
        />
        {multiples.map((m, i) => {
          const cx = xScale(i)
          const cy = multipleScale(m)
          const isActive = draggingYear === i
          return (
            <g key={i}>
              {/* Invisible larger hit target for touch */}
              <circle
                cx={cx}
                cy={cy}
                r={18}
                fill="transparent"
                style={{ cursor: 'ns-resize', touchAction: 'none' }}
                onPointerDown={handlePointerDown(i)}
                onPointerMove={handlePointerMove(i)}
                onPointerUp={handlePointerUp(i)}
                onPointerCancel={handlePointerUp(i)}
              />
              {/* Visible handle */}
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? 9 : 7}
                fill="#fff"
                stroke={COLORS.multiple}
                strokeWidth={isActive ? 3 : 2}
                pointerEvents="none"
              />
              {/* Label above */}
              <text
                x={cx}
                y={cy - 12}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={COLORS.multiple}
                pointerEvents="none"
              >
                {fmtMultiple(m)}
              </text>
            </g>
          )
        })}

        <AxisLeft
          scale={yScale}
          numTicks={4}
          tickFormat={(v) => `$${(v as number).toFixed(2)}`}
          tickLabelProps={() => ({
            fill: '#64748b',
            fontSize: 10,
            textAnchor: 'end',
            dx: -4,
            dy: 3,
          })}
          stroke="#cbd5e1"
          tickStroke="#cbd5e1"
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          numTicks={points.length}
          tickFormat={(v) => `Y${v}`}
          tickLabelProps={() => ({
            fill: '#64748b',
            fontSize: 10,
            textAnchor: 'middle',
          })}
          stroke="#cbd5e1"
          tickStroke="#cbd5e1"
        />
      </g>
    </svg>
  )
}

// ── Main widget ────────────────────────────────────────────────────────

export default function ValuationWidget({ entryId, defaultExpanded = false, hideWhenEmpty = false }: Props) {
  const [inputs, setInputs] = useState<EngineInputs>(DEFAULT_INPUTS)
  const [loaded, setLoaded] = useState(false)
  const [row, setRow] = useState<EntryValuation | null>(null)
  const [expanded, setExpanded] = useState(() => {
    if (defaultExpanded) return true
    try { return localStorage.getItem(`sdh_valuation_expanded_${entryId}`) === '1' } catch (_e) { return false }
  })
  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v
      try { localStorage.setItem(`sdh_valuation_expanded_${entryId}`, next ? '1' : '0') } catch (_e) { /* ignore */ }
      return next
    })
  }
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing row on mount (entry_valuations table).
  useEffect(() => {
    let cancelled = false
    getValuationByEntryId(entryId)
      .then((r) => {
        if (cancelled) return
        if (r) {
          setRow(r)
          setInputs({
            earningsGrowthPct: Number(r.earnings_growth_pct),
            currentMultiple: Number(r.current_multiple),
            targetMultiple: Number(r.target_multiple),
            shareholderYieldPct: Number(r.shareholder_yield_pct),
            horizonYears: Number(r.horizon_years),
            multipleCurve: Array.isArray(r.multiple_curve) ? (r.multiple_curve as number[]) : null,
          })
          setExpanded(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [entryId])

  // Debounced autosave.
  useEffect(() => {
    if (!loaded || !dirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const saved = await upsertValuation({
          entry_id: entryId,
          earnings_growth_pct: inputs.earningsGrowthPct,
          current_multiple: inputs.currentMultiple,
          target_multiple: inputs.targetMultiple,
          shareholder_yield_pct: inputs.shareholderYieldPct,
          horizon_years: inputs.horizonYears,
          multiple_curve: inputs.multipleCurve ?? null,
          notes: row?.notes ?? '',
        })
        setRow(saved)
        setDirty(false)
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [inputs, dirty, loaded, entryId, row?.notes])

  const points = useMemo(() => projectEngines(inputs), [inputs])
  const summary = useMemo(() => summarizeEngines(inputs), [inputs])
  // Effective per-year multiple curve — either the user's edits or the linear default.
  const multiples = useMemo(() => resolveMultipleCurve(inputs), [inputs])

  const applyPreset = (p: EngineInputs) => {
    setInputs({ ...p, multipleCurve: p.multipleCurve ?? null })
    setDirty(true)
  }

  const patch = (partial: Partial<EngineInputs>) => {
    setInputs((prev) => ({ ...prev, ...partial }))
    setDirty(true)
  }

  // When horizon changes we have to resize the per-year curve so it always
  // has `horizon + 1` entries. New years get the last known multiple.
  const changeHorizon = (newHorizon: number) => {
    setInputs((prev) => {
      const len = newHorizon + 1
      const cur = resolveMultipleCurve(prev)
      const next: number[] = []
      for (let i = 0; i < len; i++) {
        if (i < cur.length) next.push(cur[i])
        else next.push(cur[cur.length - 1])
      }
      return { ...prev, horizonYears: newHorizon, multipleCurve: next }
    })
    setDirty(true)
  }

  // Dragging a single year handle — update the curve array in place.
  const setMultipleAt = (yearIdx: number, value: number) => {
    setInputs((prev) => {
      const current = resolveMultipleCurve(prev)
      const next = [...current]
      next[yearIdx] = value
      // Also update the legacy current/target so the summary logic still works
      // when the user later switches a preset and falls back to linear.
      return {
        ...prev,
        multipleCurve: next,
        currentMultiple: next[0],
        targetMultiple: next[next.length - 1],
      }
    })
    setDirty(true)
  }

  // When hideWhenEmpty is set, don't render if no data saved in DB
  if (hideWhenEmpty && loaded && !row) return null

  return (
    <Card variant="outlined" sx={{ mt: 2, borderLeft: '4px solid #a855f7' }}>
      <Box
        onClick={toggleExpanded}
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <InsightsIcon fontSize="small" sx={{ color: '#a855f7' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          3 Engines of Value
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          sketch the math live
        </Typography>
        <Box sx={{ flex: 1 }} />
        {loaded && (
          <Chip
            size="small"
            label={`${fmtPct(summary.cagr)} CAGR`}
            sx={{
              height: 24,
              fontWeight: 800,
              fontSize: '0.8rem',
              bgcolor: summary.cagr >= 0 ? '#dcfce7' : '#fee2e2',
              color: summary.cagr >= 0 ? '#166534' : '#991b1b',
              border: 0,
            }}
          />
        )}
        {saving && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            saving…
          </Typography>
        )}
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: 'text.secondary',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </Box>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Drag the circle handles on each year to draw the multiple curve. Scenarios like "multiple
            compresses years 2–3, rebounds at year 5" become one gesture.
          </Typography>

          {/* ── Chart ── */}
          <Box sx={{ width: '100%', height: { xs: 260, sm: 300 }, mb: 2, touchAction: 'none' }}>
            <ParentSize>
              {({ width, height }) => (
                <EnginesStackedChart
                  width={width}
                  height={height}
                  points={points}
                  multiples={multiples}
                  onMultipleChange={setMultipleAt}
                />
              )}
            </ParentSize>
          </Box>

          {/* ── Headline stats ── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 1,
              mb: 2,
            }}
          >
            <StatTile
              label="CAGR"
              value={fmtPct(summary.cagr)}
              color={summary.cagr >= 0 ? '#166534' : '#991b1b'}
              bg={summary.cagr >= 0 ? '#f0fdf4' : '#fef2f2'}
              big
            />
            <StatTile label="Total return" value={fmtPct(summary.totalReturn)} color="#0f172a" bg="#f1f5f9" />
            <StatTile
              label="End price"
              value={`$${points[points.length - 1]?.total.toFixed(2) ?? '1.00'}`}
              color="#0f172a"
              bg="#f1f5f9"
            />
            <StatTile
              label="End multiple"
              value={fmtMultiple(summary.endMultiple)}
              color="#0f172a"
              bg="#f1f5f9"
            />
          </Box>

          {/* ── Engine share legend ── */}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
            <EngineChip
              color={COLORS.earnings}
              label={`Earnings ${fmtPct(summary.earningsContribution)}`}
              share={summary.earningsShare}
            />
            <EngineChip
              color={COLORS.multiple}
              label={`Multiple ${fmtPct(summary.multipleContribution)}`}
              share={summary.multipleShare}
            />
            <EngineChip
              color={COLORS.yield}
              label={`Yield ${fmtPct(summary.yieldContribution)}`}
              share={summary.yieldShare}
            />
          </Box>

          {/* ── Sliders + horizon ── */}
          <Stack spacing={2}>
            <SliderRow
              label="Earnings growth"
              color={COLORS.earnings}
              value={inputs.earningsGrowthPct}
              min={-10}
              max={40}
              step={0.5}
              suffix="%"
              onChange={(v) => patch({ earningsGrowthPct: v })}
            />
            <SliderRow
              label="Shareholder yield"
              color={COLORS.yield}
              value={inputs.shareholderYieldPct}
              min={-5}
              max={12}
              step={0.25}
              suffix="%"
              onChange={(v) => patch({ shareholderYieldPct: v })}
            />
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Horizon
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={inputs.horizonYears}
                onChange={(_, v) => {
                  if (v != null) changeHorizon(v as number)
                }}
                sx={{ display: 'flex', mt: 0.5 }}
              >
                {HORIZON_OPTIONS.map((y) => (
                  <ToggleButton key={y} value={y} sx={{ flex: 1, py: 0.5 }}>
                    {y}y
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Stack>

          {/* ── Preset chips ── */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Preset scenarios
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {ENGINE_PRESETS.map((p) => (
                <Tooltip key={p.id} title={p.description}>
                  <Chip
                    label={`${p.emoji} ${p.label}`}
                    size="small"
                    clickable
                    onClick={() => applyPreset(p.inputs)}
                    sx={{ fontWeight: 600 }}
                  />
                </Tooltip>
              ))}
              <IconButton
                size="small"
                onClick={() => applyPreset(DEFAULT_INPUTS)}
                sx={{ ml: 'auto' }}
                aria-label="Reset to defaults"
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  )
}

// ── Small helper components ───────────────────────────────────────────

interface SliderRowProps {
  label: string
  color: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}

function SliderRow({ label, color, value, min, max, step, suffix, onChange }: SliderRowProps) {
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="baseline">
        <Typography variant="caption" fontWeight={700} sx={{ color }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={700} sx={{ color }}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(1)}
          {suffix}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(v as number)}
        size="small"
        sx={{ mt: 0.5, color, '& .MuiSlider-thumb': { width: 18, height: 18 } }}
      />
    </Box>
  )
}

function StatTile({
  label,
  value,
  color,
  bg,
  big,
}: {
  label: string
  value: string
  color: string
  bg: string
  big?: boolean
}) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: bg }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography
        variant={big ? 'h5' : 'h6'}
        fontWeight={800}
        sx={{ color, fontSize: big ? '1.5rem' : '1.05rem', lineHeight: 1.1 }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function EngineChip({ color, label, share }: { color: string; label: string; share: number }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        border: `1px solid ${color}`,
        bgcolor: `${color}14`,
      }}
    >
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" fontWeight={700} sx={{ color }}>
        {label}
      </Typography>
      {Number.isFinite(share) && (
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.25 }}>
          ({(share * 100).toFixed(0)}%)
        </Typography>
      )}
    </Box>
  )
}
