import ReactMarkdown from 'react-markdown'
import { Box, Chip, Link as MuiLink, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { normalizeTickerToCompany } from '../utils/tickerCompany'

/** Match $TICKER or $TICKER:EXCHANGE (e.g. $WATR, $SPX, $CSU:TO) */
const TICKER_REGEX = /^\$[A-Z0-9.:]+$/i

/** Shared ticker styling: blue tint + underline so tickers stand out in titles and body text */
const TICKER_STYLE = {
  color: 'primary.main',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
} as const

const TICKER_CHIP_STYLE = {
  mx: 0.25,
  verticalAlign: 'middle' as const,
  fontSize: 'inherit',
  height: 24,
  color: 'primary.dark',
  bgcolor: 'primary.50',
  border: '1px solid',
  borderColor: 'primary.200',
  fontWeight: 600,
  '& .MuiChip-label': { px: 0.75, textDecoration: 'underline', textUnderlineOffset: 2 },
  textDecoration: 'none',
  '&:hover': { bgcolor: 'primary.100', color: 'primary.dark', borderColor: 'primary.main' },
}

/**
 * Strip orphaned bold/italic markers that react-markdown would otherwise leak
 * as literal text. Per CommonMark a `**` opener must be followed by a non-space
 * character, so `** word` or `word **` are not valid bold and show up as raw
 * `**` in the output. We remove those before handing to the parser. Also cleans
 * up leading `>` blockquote markers inside fragments that were pasted in.
 */
function stripOrphanedMarkdownMarkers(source: string): string {
  return (
    source
      // ** with whitespace (or line-edge) on both sides  → drop the **
      .replace(/(^|\s|\u00a0|\u200b)\*\*(?=\s|\u00a0|\u200b|$)/gm, '$1')
      // * with whitespace (or line-edge) on both sides → drop the *
      .replace(/(^|\s|\u00a0|\u200b)\*(?=\s|\u00a0|\u200b|$)/gm, '$1')
      // Zero-width joiners inside bold markers ("\ufeff**text**\ufeff")
      .replace(/\ufeff/g, '')
  )
}

/** Preprocess markdown: turn standalone $TICKER into links to Idea detail page (by company key) */
function linkifyTickersInMarkdown(source: string): string {
  const cleaned = stripOrphanedMarkdownMarkers(source)
  return cleaned.replace(
    // Lookbehind characters now include `*` so $TICKER wrapped by **bold** is still linked.
    /(^|[\s(*])(\$[A-Z0-9.:]+)(?=[\s),.*]|$)/gi,
    (_, before, tickerMatch) => {
      const raw = tickerMatch.slice(1).toUpperCase()
      const company = normalizeTickerToCompany(raw) || raw
      return `${before}[${tickerMatch}](/ideas/${encodeURIComponent(company)})`
    }
  )
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(getTextContent).join('')
  if (children && typeof children === 'object' && 'props' in (children as object)) return getTextContent((children as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  return String(children ?? '')
}

interface MarkdownRenderProps {
  source: string
  /** Inline mode: no paragraph spacing, for titles or single line */
  inline?: boolean
  /** Smaller typography */
  dense?: boolean
  /** When false, $TICKER chips are not links (use inside another Link to avoid nested links) */
  tickerAsLink?: boolean
}

export default function MarkdownRender({ source, inline, dense, tickerAsLink = true }: MarkdownRenderProps) {
  const components: React.ComponentProps<typeof ReactMarkdown>['components'] = {
    strong: ({ children }) => {
      const text = getTextContent(children).trim()
      if (TICKER_REGEX.test(text)) {
        const chipSx = {
          ...TICKER_CHIP_STYLE,
          height: dense ? 20 : 24,
        }
        if (tickerAsLink) {
          const symbol = normalizeTickerToCompany(text.replace(/^\$/, '')) || text.replace(/^\$/, '').toUpperCase()
          return (
            <Chip
              size="small"
              label={text}
              component={RouterLink}
              to={`/ideas/${encodeURIComponent(symbol)}`}
              sx={chipSx}
              clickable
            />
          )
        }
        return <Chip size="small" label={text} sx={chipSx} />
      }
      return <strong>{children}</strong>
    },
    p: ({ children }) =>
      inline ? (
        <span>{children}</span>
      ) : (
        <Typography component="p" variant="body1" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
          {children}
        </Typography>
      ),
    h1: ({ children }) => (
      <Typography variant="h5" fontWeight={600} sx={{ mt: 2, mb: 1 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography variant="h6" fontWeight={600} sx={{ mt: 2, mb: 1 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2, mb: 0.5 }} color="primary.main">
        {children}
      </Typography>
    ),
    blockquote: ({ children }) => (
      <Box
        component="blockquote"
        sx={{
          borderLeft: 3,
          borderColor: 'primary.main',
          pl: 2,
          py: 0.5,
          my: 1,
          bgcolor: 'grey.100',
          borderRadius: 1,
        }}
      >
        <Typography component="span" variant="body2" color="text.secondary">
          {children}
        </Typography>
      </Box>
    ),
    a: ({ href, children }) => {
      const hrefStr = typeof href === 'string' ? href : ''
      const childText = getTextContent(children).trim()
      if (hrefStr.startsWith('/ideas/') && TICKER_REGEX.test(childText)) {
        const symbol = normalizeTickerToCompany(childText.replace(/^\$/, '')) || childText.replace(/^\$/, '').toUpperCase()
        if (!tickerAsLink) {
          return (
            <Box
              component="span"
              sx={TICKER_STYLE}
            >
              {childText}
            </Box>
          )
        }
        return (
          <Chip
            size="small"
            label={childText}
            component={RouterLink}
            to={`/ideas/${encodeURIComponent(symbol)}`}
            sx={{
              ...TICKER_CHIP_STYLE,
              height: dense ? 20 : 24,
            }}
            clickable
          />
        )
      }
      if (hrefStr.startsWith('/') && !hrefStr.startsWith('//')) {
        return (
          <MuiLink component={RouterLink} to={hrefStr} underline="hover">
            {children}
          </MuiLink>
        )
      }
      return (
        <MuiLink href={hrefStr} target="_blank" rel="noopener noreferrer" underline="hover">
          {children}
        </MuiLink>
      )
    },
    ul: ({ children }) => (
      <Box component="ul" sx={{ pl: 2, mb: 1 }}>
        {children}
      </Box>
    ),
    ol: ({ children }) => (
      <Box component="ol" sx={{ pl: 2, mb: 1 }}>
        {children}
      </Box>
    ),
    li: ({ children }) => (
      <Typography component="li" variant="body2" sx={{ mb: 0.25 }}>
        {children}
      </Typography>
    ),
    code: ({ children }) => (
      <Box
        component="code"
        sx={{
          px: 0.5,
          py: 0.25,
          bgcolor: 'grey.100',
          borderRadius: 0.5,
          fontSize: '0.9em',
        }}
      >
        {children}
      </Box>
    ),
    pre: ({ children }) => (
      <Box
        component="pre"
        sx={{
          overflow: 'auto',
          p: 1.5,
          bgcolor: 'grey.100',
          borderRadius: 1,
          fontSize: '0.85rem',
          mb: 1,
        }}
      >
        {children}
      </Box>
    ),
  }

  if (!source.trim()) return null

  const processedSource = linkifyTickersInMarkdown(source)

  return (
    <Box
      sx={{
        '& strong': { fontWeight: 600 },
        ...(dense && { '& p': { mb: 0.75 }, '& .MuiTypography-body1': { fontSize: '0.875rem' } }),
      }}
    >
      <ReactMarkdown components={components}>{processedSource}</ReactMarkdown>
    </Box>
  )
}
