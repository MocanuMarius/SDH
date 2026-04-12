import { Box, Chip, Typography } from '@mui/material'
import { getTickerSegments } from '../utils/text'
import { getTickerDisplayLabel } from '../utils/tickerCompany'
import { useTickerChart } from '../contexts/TickerChartContext'

interface TickerLinksProps {
  /** Text that may contain $TICKER patterns (e.g. $CRC, $SPX). Already stripMarkdown'd inside. */
  text: string | null | undefined
  /** Inline (span) or block (div). */
  component?: 'span' | 'div'
  /** Smaller chip/link for dense UIs. */
  dense?: boolean
  /** Variant: 'chip' (pill) or 'link' (underlined link style). */
  variant?: 'chip' | 'link'
}

/**
 * Renders text with $TICKER patterns as clickable elements that open the quick chart popup.
 */
export default function TickerLinks({
  text,
  component: Component = 'span',
  dense = false,
  variant = 'chip',
}: TickerLinksProps) {
  const { openChart } = useTickerChart()
  const segments = getTickerSegments(text)
  if (segments.length === 0) return <Component>{text ?? ''}</Component>

  return (
    <Box
      component={Component}
      sx={{
        display: 'inline',
        '& .ticker-chip': {
          mx: 0.25,
          verticalAlign: 'middle',
          fontSize: 'inherit',
          height: dense ? 20 : 24,
          color: 'primary.main',
          bgcolor: 'primary.50',
          borderColor: 'primary.200',
          '& .MuiChip-label': { px: 0.75 },
          cursor: 'pointer',
          '&:hover': { bgcolor: 'primary.100', color: 'primary.dark' },
        },
      }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.value}</span>
        }
        const symbol = seg.symbol
        const label = getTickerDisplayLabel(symbol) || `$${symbol}`
        if (variant === 'chip') {
          return (
            <Chip
              key={i}
              size="small"
              label={label}
              className="ticker-chip"
              clickable
              onClick={(e) => { e.stopPropagation(); openChart(symbol) }}
            />
          )
        }
        return (
          <Typography
            key={i}
            component="span"
            sx={{
              mx: 0.25,
              fontWeight: 600,
              color: 'primary.main',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              '&:hover': { color: 'primary.dark' },
            }}
            onClick={(e) => { e.stopPropagation(); openChart(symbol) }}
          >
            {label}
          </Typography>
        )
      })}
    </Box>
  )
}
