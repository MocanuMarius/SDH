/**
 * Plain-text renderer that auto-linkifies $TICKER mentions as chips
 * AND `http(s)://…` URLs as styled anchor tags. Used anywhere we
 * display user-typed prose: entry body, decision reasons, outcome
 * notes, reminder notes — anywhere the user might paste a research
 * link or mention a ticker.
 *
 * Rules:
 *  - Paragraphs are separated by blank lines (\n\n+).
 *  - Inside a paragraph, a single \n becomes a soft line break.
 *  - $TICKER (e.g. $AAPL, $CSU.TO) renders as a clickable chip
 *    linking to /tickers/<company-key>.
 *  - http(s) URLs render as proper <a href> with target="_blank"
 *    + rel="noopener noreferrer" so the user's session is safe.
 *  - No markdown syntax. **bold**, ###, > … render literally as the
 *    characters typed.
 */

import { Box, Chip, Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { normalizeTickerToCompany } from '../utils/tickerCompany'
import { getRichSegments, type RichSegment } from '../utils/text'
import { smartTypography } from '../utils/smartTypography'

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

/**
 * Per-line segment splitter — defers to the shared `getRichSegments`
 * helper which knows about both ticker mentions and http(s) URLs.
 *
 * Note: `getRichSegments` runs the input through `stripMarkdown`,
 * which collapses runs of whitespace. That's fine here because the
 * paragraph splitter above already chunked on real newlines, so each
 * line is being normalised intentionally.
 */
function splitRich(text: string): RichSegment[] {
  return getRichSegments(text)
}

/** Truncate a long URL for display while keeping it clickable. Mostly
 *  cosmetic — pasted research links can be 200+ chars and the raw
 *  string blows out the layout. The full URL is still in href. */
function shortenUrl(href: string): string {
  if (href.length <= 60) return href
  // Show "scheme://host/…last20chars" so the user still recognises it.
  try {
    const u = new URL(href)
    const tail = href.slice(href.length - 20)
    return `${u.host}/…${tail}`
  } catch {
    return href.slice(0, 50) + '…'
  }
}

interface PlainTextWithTickersProps {
  source: string
  /** Smaller body font (e.g. for note rows). Default: body1. */
  dense?: boolean
  /** When false, ticker chips render but are not links (use inside another Link). */
  tickerAsLink?: boolean
  /** Inline mode: render as a single span with no paragraph breaks. For titles. */
  inline?: boolean
  /** Append a subtle "∎" end-mark after the last sentence of the
   *  last paragraph — editorial "fin" convention (the newspaper
   *  "—30—" or the New Yorker's tombstone). Off by default; only
   *  the entry detail reading column turns this on. */
  endMark?: boolean
}

/** Render one line's worth of segments (text + ticker chips + URL
 *  links). Shared by both inline + block modes. */
function renderSegments(line: string, tickerAsLink: boolean) {
  return splitRich(line).map((seg, si) => {
    if (seg.type === 'text') return <span key={si}>{seg.value}</span>
    if (seg.type === 'url') {
      // External link — open in a new tab, scrub the referrer so the
      // user's session isn't leaked, and stop click propagation so
      // clicking the link inside e.g. a clickable card doesn't ALSO
      // navigate the parent.
      return (
        <Link
          key={si}
          href={seg.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          sx={{
            color: 'primary.main',
            fontWeight: 500,
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            wordBreak: 'break-all',
            '&:hover': { color: 'primary.dark', textDecorationThickness: '2px' },
          }}
        >
          {shortenUrl(seg.href)}
        </Link>
      )
    }
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
  endMark = false,
}: PlainTextWithTickersProps) {
  if (!source || !source.trim()) return null

  // The render-time `stripLegacyMarkdown(source)` defensive call has
  // been retired — the bulk DB migration (`npm run strip:legacy-markdown`
  // with service-role creds) ran on 2026-04-19 and updated the 35
  // entries that still held markdown markers. New writes are sanitised
  // at save time inside EntryFormPage. The `stripLegacyMarkdown` util
  // stays in the tree because EntryFormPage's save path still uses it
  // and a few list-rendering paths (e.g. EntryListPage's title prose)
  // call it as a paranoid no-op for the rare case where a row that
  // missed the migration sneaks back in.
  //
  // smartTypography is applied once up-front (before paragraph
  // splitting) so quote-orientation heuristics can see the full
  // prose context, not just a line at a time. Display-only — the
  // stored body is still plain ASCII, consistent with the plain-
  // text principle.
  const cleaned = smartTypography(source)

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
        const isLastPara = pi === paragraphs.length - 1
        // Plain text only — no special handling for `> ` blockquote
        // or em-dash wrap. Those were experimental "smart markdown"
        // render rules that violated the "body is plain text on
        // disk" principle, so they were removed on 2026-04-20.
        return (
          <Typography
            key={pi}
            component="p"
            variant={dense ? 'body2' : 'body1'}
            sx={{
              mb: isLastPara ? 0 : 1.25,
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            {lines.map((line, li) => {
              const isLastLine = li === lines.length - 1
              return (
                <span key={li}>
                  {li > 0 && <br />}
                  {renderSegments(line, tickerAsLink)}
                  {/* End mark: a tiny "∎" glyph sitting inline
                      after the last word of the last paragraph.
                      Newspaper convention for "the story is done".
                      Preceded by a six-per-em space so it reads as
                      a deliberate typographic mark, not a period. */}
                  {endMark && isLastPara && isLastLine && (
                    <Box
                      component="span"
                      aria-hidden
                      sx={{
                        ml: 0.5,
                        color: 'text.disabled',
                        fontSize: '0.85em',
                        verticalAlign: 'baseline',
                        userSelect: 'none',
                      }}
                    >
                      {'\u2006\u220e'}
                    </Box>
                  )}
                </span>
              )
            })}
          </Typography>
        )
      })}
    </Box>
  )
}
