/**
 * Plain-text renderer that auto-linkifies $TICKER mentions as chips.
 *
 * Rules:
 *  - Paragraphs are separated by blank lines (\n\n+).
 *  - Inside a paragraph, a single \n becomes a soft line break.
 *  - $TICKER (e.g. $AAPL, $CSU.TO) renders as a clickable chip linking to /tickers/<company-key>.
 *  - No markdown syntax. **bold**, ###, > … render literally as the characters typed.
 *
 * Use this anywhere we display the plain-text body of an entry, the optional note on a
 * decision, or any user-typed prose that should NOT support markdown formatting.
 */

import { Box, Chip, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { normalizeTickerToCompany } from '../utils/tickerCompany'
import { TICKER_IN_TEXT_REGEX } from '../utils/text'
import { stripLegacyMarkdown } from '../utils/stripLegacyMarkdown'

const TICKER_CHIP_SX = {
  mx: 0.25,
  verticalAlign: 'baseline' as const,
  fontSize: 'inherit',
  height: 'auto',
  color: 'primary.dark',
  bgcolor: 'primary.50',
  border: '1px solid',
  borderColor: 'primary.200',
  fontWeight: 700,
  borderRadius: 1,
  textDecoration: 'none',
  '& .MuiChip-label': {
    px: 1,
    py: 0.35,
    lineHeight: 1.2,
    textDecoration: 'none',
  },
  '&:hover': { bgcolor: 'primary.100', color: 'primary.dark', borderColor: 'primary.main' },
} as const

/** Split a paragraph string into segments of plain text and ticker mentions. */
function splitTickers(text: string): Array<{ kind: 'text'; value: string } | { kind: 'ticker'; symbol: string }> {
  const out: Array<{ kind: 'text'; value: string } | { kind: 'ticker'; symbol: string }> = []
  const re = new RegExp(TICKER_IN_TEXT_REGEX.source, 'gi')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) })
    out.push({ kind: 'ticker', symbol: m[1].toUpperCase() })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

interface PlainTextWithTickersProps {
  source: string
  /** Smaller body font (e.g. for note rows). Default: body1. */
  dense?: boolean
  /** When false, ticker chips render but are not links (use inside another Link). */
  tickerAsLink?: boolean
  /** Inline mode: render as a single span with no paragraph breaks. For titles. */
  inline?: boolean
}

/** Render one line's worth of segments (text + ticker chips). Shared by both modes. */
function renderSegments(line: string, tickerAsLink: boolean) {
  return splitTickers(line).map((seg, si) => {
    if (seg.kind === 'text') return <span key={si}>{seg.value}</span>
    const company = normalizeTickerToCompany(seg.symbol) || seg.symbol
    const label = `$${seg.symbol}`
    if (!tickerAsLink) {
      return <Chip key={si} label={label} sx={TICKER_CHIP_SX} />
    }
    return (
      <Chip
        key={si}
        label={label}
        component={RouterLink}
        to={`/tickers/${encodeURIComponent(company)}`}
        sx={TICKER_CHIP_SX}
        clickable
      />
    )
  })
}

export default function PlainTextWithTickers({
  source,
  dense = false,
  tickerAsLink = true,
  inline = false,
}: PlainTextWithTickersProps) {
  if (!source || !source.trim()) return null

  // Quietly clean legacy markdown markers so old content reads as clean prose.
  const cleaned = stripLegacyMarkdown(source)

  if (inline) {
    // Collapse all whitespace to a single line for title-style rendering.
    const flat = cleaned.replace(/\s+/g, ' ').trim()
    return <span>{renderSegments(flat, tickerAsLink)}</span>
  }

  // Split on blank lines into paragraphs; preserve a single newline as <br/> inside.
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.replace(/\n+$/, ''))

  return (
    <Box>
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n')
        return (
          <Typography
            key={pi}
            component="p"
            variant={dense ? 'body2' : 'body1'}
            sx={{
              mb: pi === paragraphs.length - 1 ? 0 : 1.25,
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderSegments(line, tickerAsLink)}
              </span>
            ))}
          </Typography>
        )
      })}
    </Box>
  )
}
