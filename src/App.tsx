import { BrowserRouter, Routes, Route, Navigate, Link as RouterLink, useLocation, useSearchParams, useParams } from 'react-router-dom'
import { ThemeProvider, useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import CssBaseline from '@mui/material/CssBaseline'
import { useState, useEffect, Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import LinearProgress from '@mui/material/LinearProgress'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 3 }}>
          <Typography color="error" variant="h6">Page crashed</Typography>
          <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </Typography>
        </Box>
      )
    }
    return this.props.children
  }
}
import { AppBar, Toolbar, Typography, Container, Box, Button, CircularProgress, IconButton, Badge, BottomNavigation, BottomNavigationAction, Menu, MenuItem, ListItemIcon, ListItemText, Divider, Tooltip } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import NotificationsIcon from '@mui/icons-material/Notifications'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import TimelineIcon from '@mui/icons-material/Timeline'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import WatchlistIcon from '@mui/icons-material/Bookmarks'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import { SnackbarProvider } from './contexts/SnackbarContext'
import { TickerChartProvider } from './contexts/TickerChartContext'
import ActivityDrawer, { useActivityBadge } from './components/ActivityDrawer'
import NavDrawer from './components/NavDrawer'
import theme from './theme'
import LoginPage from './pages/LoginPage'
import EntryListPage from './pages/EntryListPage'
import EntryDetailPage from './pages/EntryDetailPage'
import EntryFormPage from './pages/EntryFormPage'
// Heavy pages: lazy-loaded for code splitting
const ActionsPage = lazy(() => import('./pages/ActionsPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const IdeaDetailPage = lazy(() => import('./pages/IdeaDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'))
const DecisionFormPage = lazy(() => import('./pages/DecisionFormPage'))
const WatchlistFormPage = lazy(() => import('./pages/WatchlistFormPage'))

/** Thin LinearProgress bar shown while a lazy page chunk loads */
function PageFallback() {
  return <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }} />
}

/** Wraps a route element with Suspense + ErrorBoundary */
function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

// Primary nav items always visible on desktop
const PRIMARY_NAV = [
  { to: '/', label: 'Journal', icon: ArticleOutlinedIcon },
  { to: '/tickers', label: 'Tickers', icon: LightbulbOutlinedIcon },
  { to: '/timeline', label: 'Timeline', icon: TimelineIcon },
  { to: '/watchlist', label: 'Watchlist', icon: WatchlistIcon },
  { to: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
]

// Secondary items in "More" dropdown
const SECONDARY_NAV = [
  { to: '/actions', label: 'Trades', icon: TouchAppIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

function NavButton({ to, label, icon: Icon }: { to: string; label: string; icon: React.ElementType }) {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' || location.pathname.startsWith('/entries') : location.pathname.startsWith(to)
  return (
    <Button
      color="inherit"
      component={RouterLink}
      to={to}
      startIcon={<Icon fontSize="small" />}
      sx={{
        textTransform: 'uppercase',
        fontSize: '0.72rem',
        letterSpacing: '0.10em',
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
        borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
        borderRadius: 0,
        pb: '6px',
        px: 1.75,
        minHeight: 0,
        transition: 'color 140ms ease',
        '&:hover': { bgcolor: 'transparent', color: '#fff' },
      }}
    >
      {label}
    </Button>
  )
}

function AppBarNav({
  navOpen,
  setNavOpen,
  activityOpen: activityOpenProp,
  setActivityOpen: setActivityOpenProp,
  activityCount,
  refreshActivity,
}: {
  navOpen?: boolean
  setNavOpen?: (v: boolean) => void
  activityOpen?: boolean
  setActivityOpen?: (v: boolean) => void
  activityCount: number
  refreshActivity: () => void
}) {
  const muiTheme = useTheme()
  const isMobile = !useMediaQuery(muiTheme.breakpoints.up('md'))
  const { user, signOut } = useAuth()
  const [localActivityOpen, setLocalActivityOpen] = useState(false)
  const [localNavOpen, setLocalNavOpen] = useState(false)
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null)
  const navOpenVal = setNavOpen != null ? (navOpen ?? false) : localNavOpen
  const setNavOpenVal = setNavOpen ?? setLocalNavOpen
  const activityOpen = setActivityOpenProp != null ? (activityOpenProp ?? false) : localActivityOpen
  const setActivityOpen = setActivityOpenProp ?? setLocalActivityOpen
  if (!user) return null

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          // Subtle ink-drop shadow so the dark AppBar reads as floating
          // above the warm-paper body. Border alone wasn't visible enough
          // against the bg. Elevation kept off (=0) — we use a custom shadow
          // tuned for the newspaper aesthetic instead of MUI's standard one.
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18), 0 1px 1px rgba(15, 23, 42, 0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: { xs: 56, sm: 60 }, gap: 1 }}>
          {/* Masthead — serif wordmark, newspaper-style kicker beneath. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, minWidth: 0 }}>
            {isMobile && (
              <IconButton color="inherit" onClick={() => setNavOpenVal(true)} aria-label="Open menu" edge="start">
                <MenuIcon />
              </IconButton>
            )}
            <RouterLink to="/" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
              <Typography
                component="span"
                noWrap
                sx={{
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  fontWeight: 700,
                  fontSize: { xs: '1.25rem', sm: '1.4rem' },
                  letterSpacing: '-0.01em',
                  lineHeight: 1,
                }}
              >
                Deecide
              </Typography>
              {!isMobile && (
                <Typography
                  component="span"
                  noWrap
                  sx={{
                    fontSize: '0.62rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.55)',
                    mt: '2px',
                  }}
                >
                  Investment Journal
                </Typography>
              )}
            </RouterLink>
          </Box>

          {/* Center: primary nav (desktop only) */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, ml: 2 }}>
              {PRIMARY_NAV.map(({ to, label, icon }) => (
                <NavButton key={to} to={to} label={label} icon={icon} />
              ))}
            </Box>
          )}

          {/* Right: log decision + activity + more menu (desktop) + sign out */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Tooltip title="Log a decision">
              <IconButton color="inherit" component={RouterLink} to="/decisions/new" aria-label="Log a decision">
                <AddCircleOutlineIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reminders">
              <IconButton color="inherit" onClick={() => setActivityOpen(true)} aria-label="Reminders">
                <Badge badgeContent={activityCount} color="secondary">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {!isMobile && (
              <>
                <Tooltip title="More pages">
                  <IconButton
                    color="inherit"
                    aria-label="More pages"
                    onClick={(e) => setMoreAnchor(e.currentTarget)}
                  >
                    <MoreHorizIcon />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={moreAnchor}
                  open={Boolean(moreAnchor)}
                  onClose={() => setMoreAnchor(null)}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  PaperProps={{ sx: { mt: 0.5, minWidth: 200 } }}
                >
                  {SECONDARY_NAV.map(({ to, label, icon: Icon }) => (
                    <MenuItem
                      key={to}
                      component={RouterLink}
                      to={to}
                      onClick={() => setMoreAnchor(null)}
                    >
                      <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
                      <ListItemText>{label}</ListItemText>
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem onClick={() => { signOut(); setMoreAnchor(null) }}>
                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Sign out</ListItemText>
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      <NavDrawer
        open={navOpenVal}
        onClose={() => setNavOpenVal(false)}
        activityCount={activityCount}
        onActivityClick={() => setActivityOpen(true)}
        onSignOut={signOut}
      />
      <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} onRefresh={refreshActivity} />
      {/* Global ActionFormDialog mount retired — the "Log a decision"
          AppBar button now navigates to /decisions/new (DecisionFormPage). */}
    </>
  )
}

function MobileBottomNav({ onOpenNav }: { onOpenNav: () => void }) {
  const muiTheme = useTheme()
  const isMobile = !useMediaQuery(muiTheme.breakpoints.up('md'))
  const location = useLocation()
  if (!isMobile) return null
  const path = location.pathname
  const value = path === '/' ? '/journal' : path.startsWith('/tickers') ? '/tickers' : path.startsWith('/entries') ? '/journal' : path
  return (
    <BottomNavigation
      value={value}
      showLabels
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: 'text.primary',
        borderTop: '1px solid rgba(255,255,255,0.10)',
        // Mirror of the AppBar shadow but pointing UPWARD so the bar reads
        // as floating above the content, not glued to the bottom edge.
        boxShadow: '0 -1px 3px rgba(15, 23, 42, 0.18), 0 -1px 1px rgba(15, 23, 42, 0.12)',
        pb: 'env(safe-area-inset-bottom)',
        // Slightly taller bar + tighter, smaller labels. The old 0.68rem
        // labels read as shouting and left no breathing room between icon
        // and text; dropping to 0.6rem + 2px gap + a bit more letter
        // spacing gives the chrome a calmer, newspaper-nav cadence.
        height: 62,
        minHeight: 62,
        '& .MuiBottomNavigationAction-root': {
          color: 'rgba(255,255,255,0.62)',
          minWidth: 0,
          maxWidth: 'none',
          px: 0.75,
          pt: '6px',
          pb: '4px',
          gap: '2px',
        },
        '& .MuiBottomNavigationAction-label': {
          fontSize: '0.58rem',
          lineHeight: 1,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          mt: '3px',
          // Keep the label from jumping when an item is selected (MUI
          // grows it to 0.75rem by default; our smaller scale reads too
          // differently if we kept that bump).
          '&.Mui-selected': { fontSize: '0.58rem' },
        },
        '& .MuiBottomNavigationAction-root .MuiSvgIcon-root': {
          fontSize: '1.25rem',
        },
        '& .Mui-selected': { color: '#fff !important' },
        '& .Mui-selected .MuiBottomNavigationAction-label': { fontWeight: 700 },
        zIndex: (t) => t.zIndex.appBar - 1,
      }}
    >
      <BottomNavigationAction label="Journal" value="/journal" icon={<ArticleOutlinedIcon />} component={RouterLink} to="/" />
      <BottomNavigationAction label="Timeline" value="/timeline" icon={<TimelineIcon />} component={RouterLink} to="/timeline" />
      <BottomNavigationAction label="Tickers" value="/tickers" icon={<LightbulbOutlinedIcon />} component={RouterLink} to="/tickers" />
      <BottomNavigationAction label="Watchlist" value="/watchlist" icon={<WatchlistIcon fontSize="small" />} component={RouterLink} to="/watchlist" />
      <BottomNavigationAction label="More" value="more" icon={<MoreHorizIcon />} onClick={(e) => { e.preventDefault(); onOpenNav() }} />
    </BottomNavigation>
  )
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Legacy redirect: /ideas/:ticker → /tickers/:ticker (preserves bookmarks). */
function LegacyIdeaRedirect() {
  const { ticker } = useParams<{ ticker: string }>()
  return <Navigate to={`/tickers/${ticker ?? ''}`} replace />
}

/** Fallback for Share Target when service worker doesn't intercept */
function ShareTargetRedirect() {
  const [sp] = useSearchParams()
  const params = new URLSearchParams()
  params.set('shared', '1')
  if (sp.get('title')) params.set('title', sp.get('title')!)
  if (sp.get('text')) params.set('text', sp.get('text')!)
  if (sp.get('url')) params.set('url', sp.get('url')!)
  return <Navigate to={`/entries/new?${params.toString()}`} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedLayout><Page><EntryListPage /></Page></ProtectedLayout>} />
      <Route path="/entries/new" element={<ProtectedLayout><Page><EntryFormPage /></Page></ProtectedLayout>} />
      <Route path="/entries/:id" element={<ProtectedLayout><Page><EntryDetailPage /></Page></ProtectedLayout>} />
      <Route path="/entries/:id/edit" element={<ProtectedLayout><Page><EntryFormPage /></Page></ProtectedLayout>} />
      <Route path="/actions" element={<ProtectedLayout><Page><ActionsPage /></Page></ProtectedLayout>} />
      {/* Decision form pages — replace the old global ActionFormDialog
          modal with real routes the user can bookmark / share / hit
          Back on. /decisions/new accepts ?ticker=, ?entry_id=, ?type=
          query params for pre-fill. */}
      <Route path="/decisions/new" element={<ProtectedLayout><Page><DecisionFormPage /></Page></ProtectedLayout>} />
      <Route path="/decisions/:id/edit" element={<ProtectedLayout><Page><DecisionFormPage /></Page></ProtectedLayout>} />
      <Route path="/passed" element={<Navigate to="/tickers" replace />} />
      <Route path="/analytics" element={<ProtectedLayout><Page><AnalyticsPage /></Page></ProtectedLayout>} />
      <Route path="/analytics/calibration" element={<ProtectedLayout><Page><AnalyticsPage /></Page></ProtectedLayout>} />
      <Route path="/analytics/overview" element={<Navigate to="/analytics" replace />} />
      <Route path="/analytics/performance" element={<Navigate to="/analytics" replace />} />
      <Route path="/insights" element={<Navigate to="/analytics" replace />} />
      <Route path="/calibration" element={<Navigate to="/analytics/calibration" replace />} />
      {/* /decisions used to be Long-term horizons (since removed); the
          base path now redirects to the actions list since that's the
          natural "view decisions" surface. The /new + /:id/edit
          children are real DecisionFormPage routes (above). */}
      <Route path="/decisions" element={<Navigate to="/actions" replace />} />
      <Route path="/tickers" element={<ProtectedLayout><Page><IdeasPage /></Page></ProtectedLayout>} />
      <Route path="/tickers/:ticker" element={<ProtectedLayout><Page><IdeaDetailPage /></Page></ProtectedLayout>} />
      <Route path="/ideas" element={<Navigate to="/tickers" replace />} />
      <Route path="/ideas/:ticker" element={<LegacyIdeaRedirect />} />
      <Route path="/timeline" element={<ProtectedLayout><Page><TimelinePage /></Page></ProtectedLayout>} />
      {/* Import surface (broker + CSV) was retired — user keeps decisions
          manually now. Old URLs redirect to home so any bookmark just
          lands somewhere sane instead of 404'ing. */}
      <Route path="/import" element={<Navigate to="/" replace />} />
      <Route path="/ibkr" element={<Navigate to="/" replace />} />
      <Route path="/broker-import" element={<Navigate to="/" replace />} />
      <Route path="/settings" element={<ProtectedLayout><Page><SettingsPage /></Page></ProtectedLayout>} />
      {/* Practice / Skill engineering page retired — the per-sub-skill
          Brier loop never got a working data feed; its stats can show
          inside the Calibration tab once predictions earn outcomes. */}
      <Route path="/skill-engineering" element={<Navigate to="/analytics/calibration" replace />} />
      <Route path="/watchlist" element={<ProtectedLayout><Page><WatchlistPage /></Page></ProtectedLayout>} />
      <Route path="/watchlist/new" element={<ProtectedLayout><Page><WatchlistFormPage /></Page></ProtectedLayout>} />
      <Route path="/watchlist/:id/edit" element={<ProtectedLayout><Page><WatchlistFormPage /></Page></ProtectedLayout>} />
      <Route path="/share-target" element={<ShareTargetRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const { count: activityCount, refresh: refreshActivity } = useActivityBadge()
  const { user } = useAuth()
  const muiTheme = useTheme()
  const isMobile = !useMediaQuery(muiTheme.breakpoints.up('md'))
  // Subscribe to Postgres changes for this user — pushes from another tab/device
  // invalidate the matching React Query keys so every open page refetches live.
  useRealtimeSync(user?.id)
  // Auto-close any open drawer/menu on navigation. The drawer is over the main
  // content, so a route change without auto-close leaves it covering the new page.
  const location = useLocation()
  useEffect(() => {
    setActivityOpen(false)
    setNavOpen(false)
  }, [location.pathname])
  return (
    <>
      <AppBarNav
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        activityOpen={activityOpen}
        setActivityOpen={setActivityOpen}
        activityCount={activityCount}
        refreshActivity={refreshActivity}
      />
      <Box
        component="main"
        sx={{
          minHeight: '100vh',
          pt: { xs: '56px', sm: '64px' },
          // Leave room for the 62px mobile bottom nav (bumped from 56px).
          pb: { xs: isMobile ? 11 : 2, sm: 0 },
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            px: { xs: 1.5, sm: 2 },
            // Mobile: no top/bottom container padding — the sticky PageHeader
            // sits flush under the AppBar so there's no 6px snap when scroll
            // engages the sticky state. Bottom padding handled by main's pb.
            py: { xs: 0, sm: 1.5 },
            maxWidth: 'lg',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <AppRoutes />
        </Container>
      </Box>
      <MobileBottomNav onOpenNav={() => setNavOpen(true)} />
    </>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <SnackbarProvider>
            <TickerChartProvider>
              <AppLayout />
            </TickerChartProvider>
          </SnackbarProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
