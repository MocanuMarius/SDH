import { useMemo, useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Link,
  Card,
  CardContent,
  Chip,
} from '@mui/material'
import { ParentSize } from '@visx/responsive'
import { scaleLinear, scaleTime } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows, GridColumns } from '@visx/grid'
import { Tooltip, useTooltip } from '@visx/tooltip'
import { curveMonotoneX } from '@visx/curve'
import { Group } from '@visx/group'
import type { OutcomeAnalytics } from '../types/analytics'
import type { WeeklySentimentBand } from '../services/sentimentService'
import type { WeeklyNews } from '../services/newsService'
import { fetchWeeklySentimentBands, getSentimentColor } from '../services/sentimentService'
import { fetchWeeklyNews } from '../services/newsService'
import { fetchChartData, type ChartData } from '../services/chartApiService'

interface Props {
  outcomes: OutcomeAnalytics[]
  startDate: Date | null
  endDate: Date | null
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div role="tabpanel" hidden={value !== index} {...other} style={{ width: '100%' }}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

const MARGIN = { top: 20, right: 20, bottom: 35, left: 72 }

export default function RangeAnalysisPanel({ outcomes, startDate, endDate }: Props) {
  const [tabValue, setTabValue] = useState(0)
  const [sentimentData, setSentimentData] = useState<WeeklySentimentBand[]>([])
  const [newsData, setNewsData] = useState<WeeklyNews[]>([])
  const [spyData, setSpyData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load data when date range changes
  useEffect(() => {
    if (!startDate || !endDate) {
      setSentimentData([])
      setNewsData([])
      setSpyData(null)
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [sentiment, news, spy] = await Promise.all([
          fetchWeeklySentimentBands(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          ),
          fetchWeeklyNews(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          ),
          fetchChartData('SPY', '1y', {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
          }),
        ])
        setSentimentData(sentiment)
        setNewsData(news)
        setSpyData(spy)
      } catch (e) {
        console.warn('Failed to load range analysis data:', e)
        setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [startDate, endDate])

  // Filter outcomes for selected range
  const rangeOutcomes = useMemo(() => {
    if (!startDate || !endDate) return []
    return outcomes.filter((o) => {
      const d = new Date(o.outcomeDate)
      return d >= startDate && d <= endDate
    })
  }, [outcomes, startDate, endDate])

  // Calculate portfolio return for period
  const portfolioReturn = useMemo(() => {
    if (rangeOutcomes.length === 0) return null
    const totalPnl = rangeOutcomes.reduce((acc, o) => acc + o.realizedPnl, 0)
    const totalCapital = rangeOutcomes.reduce((acc, o) => {
      if (o.shares && o.decisionPrice) return acc + o.shares * o.decisionPrice
      return acc
    }, 0)
    if (totalCapital === 0) return null
    return (totalPnl / totalCapital) * 100
  }, [rangeOutcomes])

  // Calculate SPY return for period
  const spyReturn = useMemo(() => {
    if (!spyData || spyData.prices.length < 2) return null
    const start = spyData.prices[0]
    const end = spyData.prices[spyData.prices.length - 1]
    return ((end - start) / start) * 100
  }, [spyData])

  if (!startDate || !endDate) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Select a date range in the chart above to view period analysis
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Paper sx={{ mt: 3 }}>
      {/* Period Summary Stats */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
        <Box display="flex" gap={1} sx={{ mb: 1 }} flexWrap="wrap">
          <Chip label={`${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}`} variant="outlined" size="small" />
          <Chip label={`${rangeOutcomes.length} trades`} size="small" />
          {portfolioReturn != null && <Chip label={`Portfolio: ${portfolioReturn > 0 ? '+' : ''}${portfolioReturn.toFixed(1)}%`} color={portfolioReturn > 0 ? 'success' : 'error'} size="small" />}
          {spyReturn != null && <Chip label={`SPY: ${spyReturn > 0 ? '+' : ''}${spyReturn.toFixed(1)}%`} color={spyReturn > 0 ? 'success' : 'error'} size="small" variant="outlined" />}
        </Box>
      </Box>

      <Tabs
        value={tabValue}
        onChange={(_, v) => setTabValue(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
      >
        <Tab label="📊 Fear & Greed Index" />
        <Tab label="📈 Portfolio vs SPY" />
        <Tab label="📰 Market Themes & News" />
      </Tabs>

      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning">{error}</Alert>
        </Box>
      )}

      {/* Fear & Greed Chart */}
      <TabPanel value={tabValue} index={0}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
            Weekly Fear & Greed Index ({sentimentData.length} weeks)
          </Typography>
          {sentimentData.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No sentiment data available for this period
            </Typography>
          ) : (
            <FngChart data={sentimentData} />
          )}
        </Box>
      </TabPanel>

      {/* Portfolio vs SPY */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ p: 2 }}>
          <Box display="flex" gap={2} sx={{ mb: 3 }} flexWrap="wrap">
            <Card sx={{ flex: 1, minWidth: 180 }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Your Portfolio
                </Typography>
                <Typography
                  variant="h5"
                  sx={{ color: portfolioReturn == null ? '#94a3b8' : portfolioReturn > 0 ? '#16a34a' : '#dc2626' }}
                >
                  {portfolioReturn == null ? 'N/A' : `${portfolioReturn > 0 ? '+' : ''}${portfolioReturn.toFixed(2)}%`}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 180 }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  S&P 500 (SPY)
                </Typography>
                <Typography
                  variant="h5"
                  sx={{ color: spyReturn == null ? '#94a3b8' : spyReturn > 0 ? '#16a34a' : '#dc2626' }}
                >
                  {spyReturn == null ? 'N/A' : `${spyReturn > 0 ? '+' : ''}${spyReturn.toFixed(2)}%`}
                </Typography>
              </CardContent>
            </Card>
            {portfolioReturn != null && spyReturn != null && (
              <Card sx={{ flex: 1, minWidth: 180 }}>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Alpha vs SPY
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ color: portfolioReturn - spyReturn > 0 ? '#16a34a' : '#dc2626' }}
                  >
                    {portfolioReturn - spyReturn > 0 ? '+' : ''}
                    {(portfolioReturn - spyReturn).toFixed(2)}%
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Box>
          {spyData && spyData.prices.length > 0 ? (
            <PortfolioChart outcomes={rangeOutcomes} spyData={spyData} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No SPY data available for this period
            </Typography>
          )}
        </Box>
      </TabPanel>

      {/* News & Themes */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 3 }}>
            Market Themes & Headlines ({newsData.reduce((acc, w) => acc + w.items.length, 0)} articles)
          </Typography>
          {newsData.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No news data available for this period
            </Typography>
          ) : (
            <Box display="flex" flexDirection="column" gap={3}>
              {newsData.map((week) => (
                <Box key={week.weekStart}>
                  <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ width: 4, height: 16, bgcolor: 'primary.main', borderRadius: 1 }} />
                    <Typography variant="body2" fontWeight={600} color="primary">
                      Week of {new Date(week.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {week.items.length} articles
                    </Typography>
                  </Box>
                  <Box display="flex" flexDirection="column" gap={1.5}>
                    {week.items.slice(0, 5).map((item, idx) => (
                      <Box key={idx} sx={{ p: 1.5, bgcolor: '#f8fafc', borderLeft: 3, borderColor: 'primary.light', borderRadius: '0 4px 4px 0', transition: 'all 0.2s', '&:hover': { bgcolor: '#f1f5f9', borderColor: 'primary.main' } }}>
                        <Link href={item.url} target="_blank" rel="noopener" variant="body2" fontWeight={500} sx={{ display: 'block', mb: 0.5, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                          {item.title}
                        </Link>
                        <Box display="flex" gap={1} sx={{ mt: 0.5 }}>
                          <Chip label={item.source} size="small" variant="outlined" />
                          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                            {new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </TabPanel>
    </Paper>
  )
}

// ─── Fear & Greed Chart ──────────────────────────────────────────

function FngChart({ data }: { data: WeeklySentimentBand[] }) {
  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<WeeklySentimentBand>()

  return (
    <ParentSize>
      {({ width }) => {
        if (width < 80) return null
        const xMax = width - MARGIN.left - MARGIN.right
        const yMax = 250 - MARGIN.top - MARGIN.bottom

        if (xMax <= 0 || yMax <= 0) return null

        const dates = data.map((d) => new Date(d.weekStart))
        const xScale = scaleTime({
          domain: [dates[0], dates[dates.length - 1]],
          range: [0, xMax],
        })

        const yScale = scaleLinear({
          domain: [0, 100],
          range: [yMax, 0],
        })

        return (
          <svg width={width} height={250} style={{ overflow: 'visible' }}>
            <Group top={MARGIN.top} left={MARGIN.left}>
              <GridRows scale={yScale} width={xMax} stroke="#e2e8f0" strokeDasharray="3,3" />
              <GridColumns scale={xScale} height={yMax} stroke="#e2e8f0" strokeDasharray="3,3" />

              {/* FNG bars with color */}
              {data.map((d, i) => {
                const x = xScale(new Date(d.weekStart))
                const y = yScale(d.fngIndex)
                const color = getSentimentColor(d.sentiment)
                const barWidth = Math.max(20, xMax / data.length * 0.7)
                return (
                  <g key={i}>
                    <rect
                      x={x - barWidth / 2}
                      y={y}
                      width={barWidth}
                      height={yMax - y}
                      fill={color}
                      fillOpacity={0.75}
                      rx={2}
                      onMouseMove={() => showTooltip({ tooltipData: d, tooltipLeft: x, tooltipTop: y })}
                      onMouseLeave={hideTooltip}
                      style={{ cursor: 'pointer', transition: 'fillOpacity 0.2s' }}
                    />
                  </g>
                )
              })}

              {/* Line across */}
              <LinePath
                data={data}
                x={(d) => xScale(new Date(d.weekStart))}
                y={(d) => yScale(d.fngIndex)}
                curve={curveMonotoneX}
                stroke="#2563eb"
                strokeWidth={2}
              />

              {/* 50 neutral line */}
              <line x1={0} x2={xMax} y1={yScale(50)} y2={yScale(50)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />

              <AxisLeft scale={yScale} numTicks={5} tickFormat={(v) => `${v}`} tickLabelProps={{ fontSize: 10, fill: '#64748b' }} stroke="#e2e8f0" tickStroke="transparent" />
              <AxisBottom
                top={yMax}
                scale={xScale}
                numTicks={Math.min(6, data.length)}
                tickFormat={(v) => (v as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                tickLabelProps={{ fontSize: 10, fill: '#64748b' }}
                stroke="#e2e8f0"
                tickStroke="#e2e8f0"
              />
            </Group>

            {tooltipData && (
              <Tooltip left={tooltipLeft! + MARGIN.left} top={tooltipTop! + MARGIN.top} style={{ pointerEvents: 'none' }}>
                <Box sx={{ bgcolor: 'background.paper', p: 1, borderRadius: 1, boxShadow: 1 }}>
                  <Typography variant="caption" fontWeight={600}>
                    {tooltipData.label}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Index: {tooltipData.fngIndex}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    {tooltipData.weekStart}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </svg>
        )
      }}
    </ParentSize>
  )
}

// ─── Portfolio vs SPY Chart ──────────────────────────────────────

function PortfolioChart({ outcomes, spyData }: { outcomes: OutcomeAnalytics[]; spyData: ChartData }) {
  if (spyData.prices.length === 0 || outcomes.length === 0) {
    return <Typography variant="body2" color="text.secondary">No data</Typography>
  }

  // Normalize both to % return from first point
  const spyReturns = spyData.prices.map((p) => ((p - spyData.prices[0]) / spyData.prices[0]) * 100)

  // Portfolio cumulative return
  let portfolioCum = 0
  const portfolioPoints: { date: Date; value: number }[] = []
  for (const o of outcomes) {
    portfolioCum += o.realizedPnl
    portfolioPoints.push({ date: new Date(o.outcomeDate), value: portfolioCum })
  }

  // Normalize portfolio to same scale as SPY (%)
  const firstOutcomeCapital = outcomes[0]?.shares ? outcomes[0].shares * outcomes[0].decisionPrice : 1000
  const portfolioReturns = portfolioPoints.map((p) => (p.value / firstOutcomeCapital) * 100)

  return (
    <ParentSize>
      {({ width }) => {
        if (width < 80) return null
        const xMax = width - MARGIN.left - MARGIN.right
        const yMax = 250 - MARGIN.top - MARGIN.bottom
        if (xMax <= 0 || yMax <= 0) return null

        const dates = spyData.dates.map((d) => new Date(d))
        const xScale = scaleTime({
          domain: [dates[0], dates[dates.length - 1]],
          range: [0, xMax],
        })

        const allReturns = [...spyReturns, ...portfolioReturns]
        const yScale = scaleLinear({
          domain: [Math.min(0, ...allReturns) - 5, Math.max(0, ...allReturns) + 5],
          range: [yMax, 0],
          nice: true,
        })

        return (
          <svg width={width} height={250} style={{ overflow: 'visible' }}>
            <Group top={MARGIN.top} left={MARGIN.left}>
              <GridRows scale={yScale} width={xMax} stroke="#e2e8f0" strokeDasharray="3,3" />
              <line x1={0} x2={xMax} y1={yScale(0)} y2={yScale(0)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />

              {/* SPY line */}
              <LinePath
                data={spyData.dates.map((d, i) => ({ date: d, return: spyReturns[i] }))}
                x={(d) => xScale(new Date(d.date))}
                y={(d) => yScale(d.return)}
                curve={curveMonotoneX}
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeOpacity={0.8}
              />

              {/* Portfolio line */}
              {portfolioPoints.length > 0 && (
                <LinePath
                  data={portfolioPoints.map((p, i) => ({ date: p.date, return: portfolioReturns[i] }))}
                  x={(d) => xScale(d.date)}
                  y={(d) => yScale(d.return)}
                  curve={curveMonotoneX}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                />
              )}

              <AxisLeft scale={yScale} numTicks={5} tickFormat={(v) => `${v}%`} tickLabelProps={{ fontSize: 10, fill: '#64748b' }} stroke="#e2e8f0" tickStroke="transparent" />
              <AxisBottom
                top={yMax}
                scale={xScale}
                numTicks={Math.min(6, spyData.dates.length)}
                tickFormat={(v) => (v as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                tickLabelProps={{ fontSize: 10, fill: '#64748b' }}
                stroke="#e2e8f0"
                tickStroke="#e2e8f0"
              />
            </Group>

            {/* Legend in SVG */}
            <g>
              <rect x={width - 140} y={10} width={130} height={50} fill="white" stroke="#e2e8f0" rx={4} />
              <line x1={width - 130} y1={20} x2={width - 115} y2={20} stroke="#2563eb" strokeWidth={2} />
              <text x={width - 110} y={24} fontSize={11} fill="#64748b">
                Portfolio
              </text>
              <line x1={width - 130} y1={38} x2={width - 115} y2={38} stroke="#8b5cf6" strokeWidth={2} />
              <text x={width - 110} y={42} fontSize={11} fill="#64748b">
                S&P 500
              </text>
            </g>
          </svg>
        )
      }}
    </ParentSize>
  )
}
