import { createTheme, alpha } from '@mui/material/styles'

// Design system: radii for uniformity (form controls vs cards vs chips)
const radius = {
  /** Inputs, selects, dropdown panels, small buttons — kept low so dropdown content isn’t too rounded */
  form: 4,
  /** Chips, badges, list item pills */
  chip: 6,
  /** Cards, dialogs, sheets */
  card: 10,
  /** Large surfaces (modals, drawers) */
  surface: 12,
}

// Bright, Journalytic-inspired light theme: high contrast, light blue accent, clean typography
const tokens = {
  bgDefault: '#f8fafc',
  bgPaper: '#ffffff',
  bgElevated: '#ffffff',
  primaryMain: '#0ea5e9',
  primaryLight: '#38bdf8',
  primaryDark: '#0284c7',
  secondaryMain: '#6366f1',
  cardBg: '#f1f5f9',
  accentGreen: '#16a34a',
  accentRed: '#dc2626',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  borderSubtle: 'rgba(15, 23, 42, 0.08)',
  borderMedium: 'rgba(15, 23, 42, 0.18)',
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: tokens.primaryMain,
      light: tokens.primaryLight,
      dark: tokens.primaryDark,
      contrastText: '#ffffff',
      // Shades for chips/tags and better readability
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
    },
    secondary: {
      main: tokens.secondaryMain,
      contrastText: '#ffffff',
    },
    success: { main: tokens.accentGreen },
    error: { main: tokens.accentRed },
    background: {
      default: tokens.bgDefault,
      paper: tokens.bgPaper,
    },
    text: {
      primary: tokens.textPrimary,
      secondary: tokens.textSecondary,
    },
    divider: tokens.borderMedium,
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    h4: { fontWeight: 700, fontSize: '2rem', lineHeight: 1.3, color: tokens.textPrimary, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.3, color: tokens.textPrimary, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.4, color: tokens.textPrimary, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5, color: tokens.textPrimary, letterSpacing: '0' },
    subtitle2: { fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4, color: tokens.textSecondary },
    body1: { fontSize: '1rem', lineHeight: 1.5, color: tokens.textPrimary, letterSpacing: '0' },
    body2: { fontSize: '0.9375rem', lineHeight: 1.5, color: tokens.textSecondary, letterSpacing: '0' },
    caption: { fontSize: '0.8125rem', lineHeight: 1.4, color: tokens.textTertiary, fontWeight: 500 },
  },
  shape: { borderRadius: radius.form },
  // Simply Wall St–inspired: dashboard metric cards feel like distinct tiles
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9375rem',
          minHeight: 44,
          borderRadius: radius.form,
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (min-width: 600px)': { minHeight: 36 },
        },
        contained: {
          boxShadow: `0 2px 4px rgba(14, 165, 233, 0.15)`,
          '&:hover': {
            boxShadow: '0 6px 16px rgba(14, 165, 233, 0.32)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlined: {
          borderWidth: 1.5,
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            borderWidth: 1.5,
            backgroundColor: alpha(tokens.primaryMain, 0.06),
            borderColor: tokens.primaryMain,
          },
        },
        text: {
          '&:hover': { backgroundColor: alpha(tokens.primaryMain, 0.06) },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          borderRadius: radius.form,
          '@media (min-width: 600px)': { minWidth: 40, minHeight: 40 },
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.bgDefault,
          color: tokens.textPrimary,
          overflowX: 'hidden',
        },
        html: { overflowX: 'hidden' },
        /* Remove focus/selection outline from Recharts so chart clicks don’t show orange outline */
        '.recharts-wrapper, .recharts-wrapper:focus, .recharts-wrapper:focus-visible': { outline: 'none' },
        '.recharts-surface, .recharts-surface:focus, .recharts-surface:focus-visible': { outline: 'none' },
        '.recharts-layer': { outline: 'none' },
        '.recharts-default-legend': { outline: 'none' },
        '.recharts-legend-item, .recharts-legend-item:focus, .recharts-legend-item:focus-visible': { outline: 'none' },
        '.recharts-bar-rectangle, .recharts-bar-rectangle:focus, .recharts-bar-rectangle:focus-visible': { outline: 'none' },
        '.recharts-sector, .recharts-sector:focus, .recharts-sector:focus-visible': { outline: 'none' },
        '.recharts-dot': { outline: 'none' },
        '.recharts-line': { outline: 'none' },
        '.recharts-area': { outline: 'none' },
        '.recharts-cartesian-grid': { outline: 'none' },
        '[class^="recharts-"]': { outline: 'none' },
        '[class*=" recharts-"]': { outline: 'none' },
        '[class^="recharts-"]:focus, [class^="recharts-"]:focus-visible': { outline: 'none' },
        '[class*=" recharts-"]:focus, [class*=" recharts-"]:focus-visible': { outline: 'none' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.bgPaper,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          color: tokens.textPrimary,
          '& .MuiButton-root': { color: tokens.textPrimary },
          '& .MuiIconButton-root': { color: tokens.textPrimary },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.bgPaper,
          border: `1px solid ${tokens.borderSubtle}`,
          color: tokens.textPrimary,
          borderRadius: radius.card,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        },
        outlined: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        },
        elevation1: {
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        },
        elevation2: {
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize: '0.9375rem',
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: 'rgba(15, 23, 42, 0.02)',
          '&.Mui-focused': {
            backgroundColor: tokens.bgPaper,
            '& .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
              borderColor: tokens.primaryMain,
            },
          },
          '&:hover:not(.Mui-disabled)': {
            backgroundColor: 'rgba(15, 23, 42, 0.04)',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.primaryMain,
            },
          },
          '&.Mui-error:not(.Mui-focused) .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.accentRed,
          },
        },
        input: { padding: '12px 14px' },
        inputSizeSmall: { padding: '10px 12px' },
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
              borderRadius: 4,
              mt: 1,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: `1px solid ${tokens.borderSubtle}`,
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
          '&.Mui-selected': { backgroundColor: alpha(tokens.primaryMain, 0.1) },
          '&.Mui-selected:hover': { backgroundColor: alpha(tokens.primaryMain, 0.14) },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiFormHelperText-root': { color: tokens.textSecondary },
          '& .MuiInputLabel-root': { color: tokens.textSecondary },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderMedium },
          '& .MuiInputBase-input': { color: tokens.textPrimary },
          '& .MuiInputBase-input::placeholder': { color: tokens.textTertiary, opacity: 1 },
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
          '&[aria-selected="true"]': { backgroundColor: alpha(tokens.primaryMain, 0.1) },
          '&[aria-selected="true"]&:hover': { backgroundColor: alpha(tokens.primaryMain, 0.14) },
        },
        paper: {
          borderRadius: radius.form,
          marginTop: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: `1px solid ${tokens.borderSubtle}`,
        },
        popupIndicator: { borderRadius: radius.form },
        clearIndicator: { borderRadius: radius.form },
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
          fontSize: '0.875rem',
          borderColor: tokens.borderMedium,
          color: tokens.textPrimary,
          backgroundColor: alpha(tokens.primaryMain, 0.08),
          transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            backgroundColor: alpha(tokens.primaryMain, 0.12),
          },
          '&.MuiChip-outlined': {
            backgroundColor: tokens.bgPaper,
            borderColor: tokens.borderMedium,
            color: tokens.textPrimary,
            '&:hover': {
              backgroundColor: alpha(tokens.bgDefault, 0.5),
              borderColor: tokens.primaryMain,
            },
          },
          '& .MuiChip-deleteIcon': {
            opacity: 0.6,
            '&:hover': { opacity: 1 },
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: { color: tokens.primaryMain, fontWeight: 500 },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.primaryMain,
          color: '#fff',
          borderRadius: radius.card,
          boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
          '&:hover': { backgroundColor: tokens.primaryDark, boxShadow: '0 6px 20px rgba(14, 165, 233, 0.4)' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radius.surface },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: '1.125rem', paddingBottom: 0 },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { paddingTop: 16 },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '16px 24px', gap: 8 },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          backgroundColor: tokens.accentRed,
          color: '#fff',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.bgPaper,
          border: `1px solid ${tokens.borderSubtle}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.bgPaper,
          borderLeft: `1px solid ${tokens.borderSubtle}`,
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
          transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            backgroundColor: 'rgba(15, 23, 42, 0.02)',
          },
          '&.Mui-selected': {
            backgroundColor: alpha(tokens.primaryMain, 0.08),
            '&:hover': {
              backgroundColor: alpha(tokens.primaryMain, 0.12),
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: tokens.borderSubtle,
          fontSize: '0.9375rem',
          lineHeight: 1.5,
        },
        head: {
          backgroundColor: 'rgba(15, 23, 42, 0.02)',
          fontWeight: 700,
          color: tokens.textPrimary,
        },
      },
    },
  },
})

export default theme
export { tokens, radius }
