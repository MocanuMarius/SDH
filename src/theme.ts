import { createTheme, alpha } from '@mui/material/styles'

/**
 * Newspaper-inspired theme.
 *
 * Aesthetic targets (from docs/PRINCIPLES.md):
 *  - Generous whitespace, hairline rules, restrained palette.
 *  - Real typographic hierarchy: serif for display headings, sans-serif for body,
 *    mono for numbers.
 *  - Warm "paper" background, ink-black text, single deep-blue accent.
 *  - Surfaces lift with a subtle background tint, not heavy shadows.
 */

const radius = {
  /** Inputs, selects, dropdowns — kept low so dropdown content isn't too rounded. */
  form: 4,
  /** Chips, badges, pills. */
  chip: 6,
  /** Cards, dialogs, sheets. */
  card: 8,
  /** Large surfaces (modals, drawers). */
  surface: 10,
}

const tokens = {
  // Paper-warm whites — slightly cream background, true white surface for active areas.
  bgDefault: '#fbfaf6',
  bgPaper: '#ffffff',
  bgSubtle: '#f4f1ea',
  // Ink-black ranges. Headings dark, body slightly lighter, captions muted.
  inkBlack: '#0f172a',
  inkBody: '#1f2937',
  inkMuted: '#4b5563',
  inkFaint: '#6b7280',
  // Single deliberate accent — deep newspaper-section blue.
  primaryMain: '#1e40af',
  primaryLight: '#3b82f6',
  primaryDark: '#1e3a8a',
  primarySoft: '#dbeafe',
  // P&L colours — kept conventional but slightly muted.
  accentGreen: '#15803d',
  accentRed: '#b91c1c',
  // Hairline ruled-line for dividers — subtle but real.
  hairline: 'rgba(15, 23, 42, 0.10)',
  hairlineStrong: 'rgba(15, 23, 42, 0.18)',
}

const fontDisplay = "'Source Serif 4', 'Iowan Old Style', 'Charter', 'Georgia', serif"
const fontBody = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
const fontMono = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: tokens.primaryMain,
      light: tokens.primaryLight,
      dark: tokens.primaryDark,
      contrastText: '#ffffff',
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
    },
    secondary: { main: '#7c3aed', contrastText: '#ffffff' },
    success: { main: tokens.accentGreen },
    error: { main: tokens.accentRed },
    background: {
      default: tokens.bgDefault,
      paper: tokens.bgPaper,
    },
    text: {
      primary: tokens.inkBlack,
      secondary: tokens.inkMuted,
      disabled: tokens.inkFaint,
    },
    divider: tokens.hairline,
    grey: {
      50: tokens.bgSubtle,
      100: '#ede9df',
      200: '#e4dfd1',
    },
  },
  typography: {
    fontFamily: fontBody,
    // Display headings — serif, tight tracking, generous line-height.
    h1: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 'clamp(1.75rem, 2.4vw, 2.5rem)',
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
      color: tokens.inkBlack,
    },
    h2: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 'clamp(1.5rem, 2vw, 2rem)',
      lineHeight: 1.2,
      letterSpacing: '-0.015em',
      color: tokens.inkBlack,
    },
    h3: {
      fontFamily: fontDisplay,
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
      color: tokens.inkBlack,
    },
    h4: {
      fontFamily: fontDisplay,
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.3,
      letterSpacing: '-0.005em',
      color: tokens.inkBlack,
    },
    h5: {
      fontFamily: fontBody,
      fontWeight: 700,
      fontSize: '1.125rem',
      lineHeight: 1.35,
      letterSpacing: '-0.005em',
      color: tokens.inkBlack,
    },
    h6: {
      fontFamily: fontBody,
      fontWeight: 700,
      fontSize: '1rem',
      lineHeight: 1.4,
      letterSpacing: '0',
      color: tokens.inkBlack,
    },
    subtitle1: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5, color: tokens.inkBlack, letterSpacing: '0' },
    subtitle2: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4, color: tokens.inkBody },
    body1: { fontSize: '1rem', lineHeight: 1.55, color: tokens.inkBody, letterSpacing: '0' },
    body2: { fontSize: '0.9375rem', lineHeight: 1.55, color: tokens.inkBody, letterSpacing: '0' },
    caption: { fontSize: '0.78rem', lineHeight: 1.4, color: tokens.inkMuted, fontWeight: 500 },
    overline: {
      fontSize: '0.7rem',
      lineHeight: 1.4,
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: tokens.inkMuted,
      textTransform: 'uppercase',
    },
  },
  shape: { borderRadius: radius.form },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.bgDefault,
          color: tokens.inkBlack,
          overflowX: 'clip',
          fontFeatureSettings: '"ss01", "cv11"',
          // Use tabular numerals globally so price/% columns align nicely.
          fontVariantNumeric: 'tabular-nums',
        },
        html: { overflowX: 'clip' },
        // Tone the native date picker calendar icon to match body ink so it
        // doesn't glare in white-blue on warm-paper backgrounds.
        'input[type="date"]::-webkit-calendar-picker-indicator': {
          opacity: 0.55,
          cursor: 'pointer',
          filter: 'grayscale(1)',
        },
        'input[type="date"]:hover::-webkit-calendar-picker-indicator': {
          opacity: 0.85,
        },
        'input[type="date"]': {
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
        },
        // Numbers feel newspaper-y in mono — apply to anything tagged `mono`.
        '.mono, code, pre, kbd, samp': { fontFamily: fontMono },
        // Prevent the chart wrapper from showing focus outlines.
        '.recharts-wrapper, .recharts-wrapper:focus, .recharts-wrapper:focus-visible': { outline: 'none' },
        '.recharts-surface, .recharts-surface:focus, .recharts-surface:focus-visible': { outline: 'none' },
        '.recharts-layer': { outline: 'none' },
        '.recharts-default-legend': { outline: 'none' },
        '[class^="recharts-"]': { outline: 'none' },
        '[class*=" recharts-"]': { outline: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9375rem',
          minHeight: 40,
          borderRadius: radius.form,
          transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
          '@media (min-width: 600px)': { minHeight: 36 },
        },
        contained: {
          // Flat — no drop shadow, just a tonal hover. Newspaper sections don't float.
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none', backgroundColor: tokens.primaryDark },
          '&:active': { boxShadow: 'none' },
        },
        outlined: {
          borderWidth: 1,
          '&:hover': {
            borderWidth: 1,
            backgroundColor: alpha(tokens.primaryMain, 0.06),
            borderColor: tokens.primaryMain,
          },
        },
        text: {
          '&:hover': { backgroundColor: alpha(tokens.inkBlack, 0.04) },
        },
        sizeLarge: { fontSize: '1rem', minHeight: 44, paddingLeft: 20, paddingRight: 20 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.form,
          transition: 'background-color 140ms ease',
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          // Deep ink top bar — keeps the masthead grounded.
          backgroundColor: tokens.inkBlack,
          borderBottom: `1px solid ${tokens.hairline}`,
          borderRadius: 0,
          color: '#ffffff',
          '& .MuiButton-root': { color: '#ffffff' },
          '& .MuiIconButton-root': { color: '#ffffff' },
          '& .MuiTypography-root': { color: '#ffffff' },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.bgPaper,
          color: tokens.inkBody,
          borderRadius: radius.card,
          // Default surfaces have hairlines, no shadow. Elevated variants opt in.
          boxShadow: 'none',
        },
        outlined: {
          border: `1px solid ${tokens.hairline}`,
          boxShadow: 'none',
        },
        elevation1: { boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.05)' },
        elevation2: { boxShadow: '0 2px 6px rgba(15, 23, 42, 0.06), 0 4px 10px rgba(15, 23, 42, 0.06)' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.form,
          fontSize: '0.9375rem',
          backgroundColor: tokens.bgPaper,
          transition: 'border-color 140ms ease, background-color 140ms ease',
          '&.Mui-focused': {
            backgroundColor: tokens.bgPaper,
            '& .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1.5,
              borderColor: tokens.primaryMain,
            },
          },
          '&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.hairlineStrong,
          },
          '&.Mui-error:not(.Mui-focused) .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.accentRed,
          },
        },
        input: { padding: '11px 13px' },
        inputSizeSmall: { padding: '9px 11px' },
        notchedOutline: { borderColor: tokens.hairline, transition: 'border-color 140ms ease' },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: { paddingRight: 36 },
      },
      defaultProps: {
        MenuProps: {
          PaperProps: {
            sx: {
              borderRadius: 1,
              mt: 1,
              boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
              border: `1px solid ${tokens.hairline}`,
            },
          },
          MenuListProps: { sx: { py: 0 } },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          margin: 0,
          minHeight: 40,
          paddingLeft: 12,
          paddingRight: 12,
          '&.Mui-selected': { backgroundColor: alpha(tokens.primaryMain, 0.08) },
          '&.Mui-selected:hover': { backgroundColor: alpha(tokens.primaryMain, 0.14) },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiFormHelperText-root': { color: tokens.inkMuted, marginLeft: 0 },
          '& .MuiInputLabel-root': { color: tokens.inkMuted },
          '& .MuiInputBase-input': { color: tokens.inkBlack },
          '& .MuiInputBase-input::placeholder': { color: tokens.inkFaint, opacity: 1 },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        listbox: { padding: 0 },
        option: {
          borderRadius: 0,
          margin: 0,
          minHeight: 40,
          '&[aria-selected="true"]': { backgroundColor: alpha(tokens.primaryMain, 0.08) },
          '&[aria-selected="true"]&:hover': { backgroundColor: alpha(tokens.primaryMain, 0.14) },
        },
        paper: {
          borderRadius: radius.form,
          marginTop: 4,
          boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
          border: `1px solid ${tokens.hairline}`,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        outlined: { '&.MuiInputLabel-shrink': { color: tokens.primaryMain } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.chip,
          fontWeight: 500,
          fontSize: '0.85rem',
          borderColor: tokens.hairlineStrong,
          color: tokens.inkBlack,
          backgroundColor: tokens.bgSubtle,
          transition: 'background-color 140ms ease, border-color 140ms ease',
          '&:hover': { backgroundColor: '#ede9df' },
          '&.MuiChip-outlined': {
            backgroundColor: tokens.bgPaper,
            borderColor: tokens.hairlineStrong,
            color: tokens.inkBlack,
            '&:hover': { backgroundColor: tokens.bgSubtle, borderColor: tokens.primaryMain },
          },
          '&.MuiChip-colorPrimary': {
            backgroundColor: tokens.primaryMain,
            color: '#ffffff',
            '&:hover': { backgroundColor: tokens.primaryDark },
          },
          '& .MuiChip-deleteIcon': {
            opacity: 0.55,
            '&:hover': { opacity: 1 },
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { color: tokens.primaryMain, fontWeight: 500, textDecorationThickness: '1px', textUnderlineOffset: 2 },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.primaryMain,
          color: '#fff',
          borderRadius: radius.card,
          boxShadow: '0 4px 14px rgba(30,64,175,0.28)',
          '&:hover': { backgroundColor: tokens.primaryDark },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radius.surface, border: `1px solid ${tokens.hairline}` },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.25rem', paddingBottom: 4 },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { paddingTop: 16 },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '12px 24px', gap: 8 },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: { backgroundColor: tokens.accentRed, color: '#fff' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.bgPaper,
          border: `1px solid ${tokens.hairline}`,
          borderLeftWidth: 3,
        },
        standardInfo: { borderLeftColor: tokens.primaryMain },
        standardSuccess: { borderLeftColor: tokens.accentGreen },
        standardWarning: { borderLeftColor: '#b45309' },
        standardError: { borderLeftColor: tokens.accentRed },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.bgPaper,
          borderLeft: `1px solid ${tokens.hairline}`,
          borderRight: `1px solid ${tokens.hairline}`,
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 120ms ease',
          '&:hover': { backgroundColor: alpha(tokens.inkBlack, 0.025) },
          '&.Mui-selected': {
            backgroundColor: alpha(tokens.primaryMain, 0.06),
            '&:hover': { backgroundColor: alpha(tokens.primaryMain, 0.10) },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: tokens.hairline, fontSize: '0.9375rem', lineHeight: 1.5 },
        head: {
          backgroundColor: tokens.bgSubtle,
          fontFamily: fontBody,
          fontWeight: 700,
          fontSize: '0.78rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: tokens.inkMuted,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: tokens.hairline },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 56,
          '@media (min-width: 600px)': { minHeight: 60 },
        },
      },
    },
  },
})

export default theme
export { tokens, radius, fontDisplay, fontBody, fontMono }
