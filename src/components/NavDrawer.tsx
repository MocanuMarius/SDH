/**
 * Mobile nav drawer: all main links + sign out.
 * Used when hamburger is clicked on small screens.
 */

import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Divider } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import NotificationsIcon from '@mui/icons-material/Notifications'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import TimelineIcon from '@mui/icons-material/Timeline'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import SchoolIcon from '@mui/icons-material/School'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { Badge } from '@mui/material'

const NAV_ITEMS = [
  { to: '/', label: 'Journal', icon: MenuBookIcon },
  { to: '/tickers', label: 'Tickers', icon: LightbulbIcon },
  { to: '/timeline', label: 'Timeline', icon: TimelineIcon },
  { to: '/watchlist', label: 'Watchlist', icon: NotificationsActiveIcon },
  { to: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { to: '/actions', label: 'Trades', icon: TouchAppIcon },
  { to: '/skill-engineering', label: 'Practice', icon: SchoolIcon },
  { to: '/import', label: 'Import', icon: FileDownloadIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

interface NavDrawerProps {
  open: boolean
  onClose: () => void
  activityCount?: number
  onActivityClick?: () => void
  onSignOut: () => void
}

export default function NavDrawer({
  open,
  onClose,
  activityCount = 0,
  onActivityClick,
  onSignOut,
}: NavDrawerProps) {
  const location = useLocation()

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 280,
          maxWidth: '85vw',
          pt: 2,
          pb: 2,
        },
      }}
    >
      <List dense disablePadding>
        {onActivityClick != null && (
          <>
            <ListItemButton
              onClick={() => {
                onActivityClick()
                onClose()
              }}
              sx={{ py: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Badge badgeContent={activityCount} color="secondary">
                  <NotificationsIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText primary="Reminders" />
            </ListItemButton>
            <Divider sx={{ my: 1 }} />
          </>
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <ListItemButton
            key={to}
            component={RouterLink}
            to={to}
            onClick={onClose}
            selected={location.pathname === to || (to !== '/' && location.pathname.startsWith(to))}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Icon />
            </ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ flex: 1 }} />
      <Divider />
      <List dense disablePadding>
        <ListItemButton onClick={() => { onSignOut(); onClose() }} sx={{ py: 1.5 }}>
          <ListItemIcon sx={{ minWidth: 40 }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </ListItemButton>
      </List>
    </Drawer>
  )
}
