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
  /** Optional map of ticker → ReactNode rendered in a right-side
   *  gutter next to the paragraph where that ticker is FIRST
   *  mentioned. Enables the editorial sidenote feature on the
   *  entry detail page without affecting any other consumer of
   *  this component. Hidden below the md breakpoint where there
   *  isn't room for a true margin column. */
  gutterAnnotations?: Map<string, React.ReactNode>
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
  gutterAnnotations,
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

  // Marginalia detection — the Quick Note writer on EntryDetailPage
  // appends "Note <Mon> <day>, <yy>: ..." paragraphs to the body over
  // time. Rather than letting those look like regular prose, we
  // style them as postscripts: italic, muted, with a small-caps
  // date kicker. The same append pattern then reads as "updates
  // from the editor" rather than random concatenated lines.
  const NOTE_REGEX = /^Note\s+([A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{2,4})?):\s*/
  const isNote = (p: string) => NOTE_REGEX.test(p)

  // End-mark goes on the last NON-note paragraph so postscripts
  // don't steal the "fin" glyph that should close the main story.
  // Falls back to the literal last paragraph if every paragraph is
  // a note (degenerate — the body is all postscripts, no main prose).
  let lastNonNoteIdx = -1
  paragraphs.forEach((p, i) => { if (!isNote(p)) lastNonNoteIdx = i })
  if (lastNonNoteIdx === -1) lastNonNoteIdx = paragraphs.length - 1

  // Pre-compute which tickers make their FIRST appearance in each
  // paragraph (for the gutter-annotation feature). A ticker only
  // annotates once per article — at the paragraph where it's first
  // introduced — so repeat mentions don't clutter the margin. Keyed
  // on paragraph index to keep the render loop branch-free.
  const firstMentionByPara = new Map<number, string[]>()
  if (gutterAnnotations && gutterAnnotations.size > 0) {
    const seen = new Set<string>()
    paragraphs.forEach((para, pi) => {
      const inThisPara: string[] = []
      // getRichSegments normalises whitespace, so it handles a
      // paragraph with internal \n fine — it reads the whole
      // paragraph as one linear stream of segments.
      for (const seg of getRichSegments(para)) {
        if (seg.type !== 'ticker') continue
        const sym = seg.symbol
        if (gutterAnnotations.has(sym) && !seen.has(sym)) {
          seen.add(sym)
          inThisPara.push(sym)
        }
      }
      if (inThisPara.length > 0) firstMentionByPara.set(pi, inThisPara)
    })
  }
  const hasGutter = firstMentionByPara.size > 0

  return (
    <Box>
      {paragraphs.map((para, pi) => {
        const isLastPara = pi === paragraphs.length - 1
        const noteMatch = para.match(NOTE_REGEX)
        const showEndMark = endMark && pi === lastNonNoteIdx

        // Paragraph rhythm lives on the WRAPPING Box — Typography
        // always has mb: 0. This keeps behaviour consistent whether
        // the gutter feature is active or not, and avoids conflicts
        // with global `& p:last-of-type { mb: 0 }` overrides on the
        // host container (since every wrapped p is also the
        // first/last-of-type within its own wrapper).
        const paragraphMb = isLastPara ? 0 : 1.25
        const typographyMb = 0

        let proseElement: React.ReactNode = null

        // ── Marginalia branch ──
        // Paragraphs that start with "Note <Mon> <d>, <yy>:" render
        // with a small-caps kicker + italic, muted body. The kicker
        // is reformatted to newspaper style (NOTE · APR 21, 2026).
        if (noteMatch) {
          const kicker = noteMatch[1].toUpperCase()
          const bodyText = para.slice(noteMatch[0].length)
          const lines = bodyText.split('\n')
          proseElement = (
            <Typography
              component="p"
              variant={dense ? 'body2' : 'body1'}
              data-first-paragraph={pi === 0 ? 'true' : undefined}
              sx={{
                mb: typographyMb,
                fontStyle: 'italic',
                color: 'text.secondary',
                fontSize: '0.94em',
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
            >
              <Box
                component="span"
                aria-hidden
                sx={{
                  fontStyle: 'normal',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontSize: '0.7em',
                  color: 'text.disabled',
                  mr: 0.75,
                  whiteSpace: 'nowrap',
                }}
              >
                Note · {kicker}
              </Box>
              {lines.map((line, li) => {
                const isLastLine = li === lines.length - 1
                return (
                  <span key={li}>
                    {li > 0 && <br />}
                    {renderSegments(line, tickerAsLink)}
                    {showEndMark && isLastLine && (
                      <Box
                        component="span"
                        aria-hidden
                        sx={{
                          ml: 0.5,
                          color: 'text.disabled',
                          fontSize: '0.85em',
                          verticalAlign: 'baseline',
                          userSelect: 'none',
                          fontStyle: 'normal',
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
        } else {
          // ── Regular prose branch ──
          const lines = para.split('\n')
          proseElement = (
            <Typography
              component="p"
              variant={dense ? 'body2' : 'body1'}
              data-first-paragraph={pi === 0 ? 'true' : undefined}
              sx={{
                mb: typographyMb,
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
                        after the last word of the last non-note
                        paragraph. Newspaper convention for "the
                        story is done". Preceded by a six-per-em
                        space so it reads as a deliberate typographic
                        mark, not a period. */}
                    {showEndMark && isLastLine && (
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
        }

        // ── Paragraph-wrapper layer ──
        // Always wrap the Typography in a keyed Box. When the gutter
        // feature is active, the Box becomes a 1fr-+-140 px grid row
        // holding prose in column 1 and any gutter annotations in
        // column 2. Without gutter, the Box is a cheap pass-through
        // (no styles beyond the paragraph-rhythm margin-bottom).
        //
        // The drop-cap selector in EntryDetailPage uses the
        // `data-first-paragraph` attribute (set inside proseElement
        // above) rather than `:first-of-type`, so it keeps working
        // regardless of how many wrapping Boxes sit between the
        // body container and the paragraph element.
        const mentionsHere = gutterAnnotations && gutterAnnotations.size > 0
          ? (firstMentionByPara.get(pi) ?? [])
          : []
        return (
          <Box
            key={pi}
            sx={
              hasGutter
                ? {
                    display: { xs: 'block', md: 'grid' },
                    gridTemplateColumns: { md: '1fr 140px' },
                    columnGap: { md: 3 },
                    alignItems: 'start',
                    mb: paragraphMb,
                  }
                : { mb: paragraphMb }
            }
          >
            {proseElement}
            {mentionsHere.length > 0 && (
              <Box
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  flexDirection: 'column',
                  gap: 1,
                  pt: 0.5,
                }}
              >
                {mentionsHere.map((ticker) => (
                  <Box key={ticker}>{gutterAnnotations!.get(ticker)}</Box>
                ))}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
